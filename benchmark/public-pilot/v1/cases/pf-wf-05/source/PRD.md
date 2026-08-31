# PRD — ai-incident-commander

| Field | Value |
|---|---|
| **Project** | ai-incident-commander — AI incident commander for war rooms, timelines, and postmortems |
| **Document type** | Product Requirements Document (What & Why) |
| **Status** | Draft |
| **Created** | 2026-07-12 |
| **Owner** | Debashish Ghosal |
| **Target release** | v0.1.0 (private → public after M1-M10 checklist, see `docs/wbs.md`) |
| **License** | MIT |

---

## 1. Glossary

### 1.1 Incident response terms

| Term | Definition |
|---|---|
| **SEV1** | Severity 1 — critical incident. Production is down or a core business function is broken. Requires immediate response. |
| **SEV2** | Severity 2 — major incident. A key service is degraded but not down. Requires urgent response. |
| **SEV3** | Severity 3 — minor incident. Limited impact, often a single feature degraded. Standard response cadence. |
| **War room** | A dedicated communication channel (real or virtual) where all incident responders coordinate. Origin: a physical room where engineers gathered during crises. |
| **Incident commander** | The person who coordinates the incident response. Does not fix the problem themselves — orchestrates others, communicates with stakeholders, maintains the timeline. |
| **MTTR** | Mean Time To Resolution — the average time from incident start to resolution. The primary efficiency metric for incident response. |
| **On-call** | The engineer responsible for responding to incidents during a specific time period (typically a 1-week rotation). |
| **PagerDuty** | A popular alerting and on-call management platform. Routes alerts to the right engineer based on schedules and escalation policies. |
| **Runbook** | A documented set of procedures for responding to a specific type of incident or operational task. |
| **Postmortem** | A document written after an incident that captures what happened, why, how it was resolved, and what to do to prevent recurrence. |
| **COE** | Correction of Errors — Amazon's postmortem format. Focuses on what went wrong, why, and corrective actions. Blameless by design. |
| **Blameless postmortem** | A postmortem philosophy that focuses on systemic failures, not individual mistakes. "What failed" not "who failed." |
| **Stakeholder update** | A periodic communication to stakeholders during an incident, summarizing impact, current actions, and next update time. |
| **Consequence-first format** | A stakeholder update structure: lead with impact (what's broken, who's affected), then root cause hypothesis, then action, then next update time. |
| **RAG** | Retrieval-Augmented Generation — combining an LLM with a search over a knowledge base (runbooks, past incidents) to ground responses in real data. |

### 1.2 AI / agent terms

| Term | Definition |
|---|---|
| **Agent** | An AI system that takes actions in a loop: observes state, decides what to do, executes, observes the result, repeats. |
| **LLM** | Large Language Model — a neural network trained on text that generates text responses. Examples: GPT-4, Claude, Qwen, Llama, DeepSeek. |
| **Token** | The unit of text that LLMs process. Roughly 4 characters or 0.75 words per token. Pricing is per-token (input + output). |
| **Human-in-the-loop** | A pattern where a human reviews or approves an agent's action before it proceeds. Core safety pattern for this tool. |
| **Interrupt** | A mechanism that pauses an agent's execution and waits for human input before continuing. Used for all approval points. |
| **Hallucination** | When an LLM generates output that is plausible-sounding but incorrect or fabricated. Dangerous during incidents. |
| **Confidence score** | A numerical estimate (0.0–1.0) of how confident the agent is in a suggestion. Low-confidence suggestions are suppressed. |
| **Simulation mode** | A mode where the tool generates fake alerts, logs, and messages so users can evaluate it without real credentials or production data. |
| **Foreground CLI** | A CLI interaction model where the tool runs in the terminal, blocking and waiting for user input at decision points. No background daemon. |
| **OMLX** | Open Model Language eXchange — a local model serving platform. The tool is designed to work with local models for cost-conscious analysis. |
| **Ollama** | A local LLM runtime. Alternative to OMLX for serving models like Qwen, Llama, DeepSeek on local hardware. |

---

## 2. Problem

### 2.1 The core failure mode

When SEV1 hits, the incident commander's cognitive load is extreme: reading logs, coordinating 5+ engineers, updating stakeholders, building the timeline. The commander is the bottleneck — and the commander is human, stressed, and making decisions on incomplete information.

The mechanical work — building the timeline from scattered sources, drafting stakeholder updates on a timer, generating a postmortem — consumes the commander's attention when they should be **thinking**, not **typing**.

### 2.2 The ecosystem gap

| Category | Existing tools | What they miss |
|---|---|---|
| **Incident management** | PagerDuty, Opsgenie, Incident.io | Alert routing and on-call scheduling. No AI-assisted timeline, stakeholder comms, or postmortem drafting. |
| **ChatOps** | Slack, MS Teams | Communication channel. No incident-aware automation — humans post updates manually. |
| **Observability** | Datadog, Grafana, Prometheus, Loki | Metrics and logs. No incident coordination layer — the commander reads dashboards and manually synthesizes. |
| **Runbook automation** | RAGoncall, Robusta, RunWhen | Runbook retrieval and execution. No incident lifecycle management — they answer "what should I do?" but not "what's happening, who needs to know, and what did we learn?" |
| **Postmortem tools** | Collablog, postmortem templates | Templates and storage. No AI-assisted drafting from incident data — humans write from scratch. |
| **AI SRE agents** | HolmesGPT, sre-warroom, sre-copilot | Partial coverage. HolmesGPT investigates but doesn't draft comms or postmortems. sre-warroom has 5 agents but no simulation mode and no adoption. None cover the full lifecycle with human-in-the-loop safety. |

**The missing layer:** nobody orchestrates the full incident lifecycle — live timeline reconstruction, stakeholder communication drafting, remediation suggestion, and postmortem generation — as a single AI-driven workflow with human approval at every external action. Each piece exists in isolation; the commander stitches them together manually under pressure.

### 2.3 Why now

- **Agentic AI is production-ready for structured workflows.** Stateful agent graphs with interrupt points and human-in-the-loop patterns make it possible to build an agent that assists during incidents without risking uncontrolled actions. The agent drafts; the human approves. This wasn't safely buildable 2 years ago.
- **Incident response is the highest-stakes DevOps workflow.** MTTR directly impacts revenue, customer trust, and engineer burnout. Every minute the commander spends on mechanics (typing updates, building timelines) is a minute not spent on diagnosis.
- **Stakeholder communication is chronically neglected.** During incidents, stakeholders get inconsistent, delayed, or panicked updates. A tool that drafts consequence-first updates on a timer — with human approval — solves a problem every on-call team experiences.
- **Postmortems take too long.** The 3-hour postmortem drafting process is well-documented. An AI that generates a draft from the incident timeline in minutes — with clear AI/human section labeling — is a 10x improvement.
- **No `pip install` solution exists for this.** Every team re-implements ad hoc war room scripts and manual postmortem templates. There is no drop-in tool that works with zero credentials (simulation) and scales to real integrations.

### 2.4 Cost of not solving this

| Failure | Impact |
|---|---|
| Commander is the bottleneck | Decisions delayed; MTTR increases; cognitive overload leads to errors |
| Timeline reconstructed manually | Incomplete timelines; missing events; root cause analysis takes longer |
| Stakeholder updates inconsistent | Stakeholders lose trust; they interrupt the war room for status; engineers context-switch |
| Postmortem drafting takes 3 hours | Action items are delayed; lessons aren't captured while memory is fresh; engineers dread postmortems |
| No pattern matching from past incidents | Teams repeat the same mistakes; remediation knowledge lives in one engineer's head |
| No deploy correlation | "A PR was merged 15 min before the alert" is missed; root cause investigation starts from scratch |

---

## 3. Target users

### 3.1 Primary persona — On-call engineer / Incident commander

> **"When SEV1 hits, I'm overwhelmed. I need something that builds the timeline, drafts stakeholder updates, and generates the postmortem — so I can focus on diagnosis and decisions."**

- SRE, DevOps engineer, or platform engineer who serves as incident commander
- Has been incident commander during at least one SEV1 and felt the cognitive overload
- Wants an assistant, not a replacement — the human makes all decisions
- Cares about MTTR, stakeholder trust, and postmortem quality
- May or may not have Slack/PagerDuty — needs the tool to work without them in v0.1.0

### 3.2 Secondary persona — AI/agent developer

> **"I want to see how a multi-agent system handles a real-world, high-stakes workflow with human-in-the-loop interrupts, safety guardrails, and multi-source data fusion."**

- AI/ML engineer or platform engineer building agentic systems
- Studies the architecture: state graph design, interrupt patterns, tool integration, safety constraints
- Wants a reference implementation for a production-grade agentic workflow
- Cares about code quality, testability, and architectural patterns

### 3.3 Tertiary persona — Engineering manager / Director

> **"I need our incident response to be faster and more consistent. I want my team to have tooling that standardizes timelines and postmortems."**

- Engineering manager, director, or VP responsible for incident response quality
- Cares about MTTR metrics, stakeholder communication consistency, and postmortem action item closure
- Wants a tool their team can adopt without a massive migration
- Cares about the safety story — "does the AI make decisions or just assist?"

### 3.4 Quaternary persona — Open-source contributor

> **"I want to contribute to AI-assisted incident response tooling. Show me good first issues and a clear contribution path."**

- Python developer interested in SRE/AI intersection
- Looking for meaningful OSS contributions in the agentic SRE space
- May contribute new timeline sources, simulation scenarios, postmortem templates, or integrations

---

## 4. User journeys

### 4.1 Journey 1 — New user evaluating the tool (simulation mode)

> **Emotional arc: skeptical → curious → impressed**

```
┌─────────────────────────────────────────────────────────────────┐
│  State: Skeptical                                                │
│  "Another AI tool? Does it actually do something useful?"       │
│                                                                  │
│  ▼ Runs: incident-commander simulate --service payment \        │
│         --severity SEV1                                          │
│                                                                  │
│  State: Curious                                                  │
│  "OK, it generated a fake alert and is building a timeline..."  │
│                                                                  │
│  ▼ Watches the timeline build from multiple simulated sources    │
│  ▼ Sees the first stakeholder update draft appear               │
│  ▼ Reviews the draft: consequence-first, clinical, actionable   │
│                                                                  │
│  State: Impressed                                                │
│  "This is actually useful. The update format is exactly what     │
│   I struggle to write under pressure. And it waited for my       │
│   approval before doing anything."                               │
│                                                                  │
│  ▼ Approves the update → sees it would be posted to comms        │
│  ▼ Sees remediation suggestion with citation + confidence        │
│  ▼ Sees postmortem draft with AI sections labeled                │
│  ▼ Sees cost report for the session                              │
│                                                                  │
│  State: Convinced                                                │
│  "I could use this in my next on-call shift. Zero setup,        │
│   zero credentials, and it produces pasteable output."           │
└─────────────────────────────────────────────────────────────────┘
```

**Decision points:** User reviews each draft (stakeholder update, remediation, postmortem) and approves or rejects. The tool blocks and waits — no autonomous action.

**Exit state:** User has a markdown file with the timeline, stakeholder updates, remediation suggestions, and postmortem draft — all pasteable into their existing tools.

### 4.2 Journey 2 — On-call engineer during a real SEV1 (simulation-assisted)

> **Emotional arc: overwhelmed → supported → relieved**

```
┌─────────────────────────────────────────────────────────────────┐
│  State: Overwhelmed                                              │
│  PagerDuty alert fires. SEV1. Payment service is down.          │
│  3 engineers in the channel. Stakeholders are asking questions. │
│  The commander is juggling diagnosis + comms + coordination.    │
│                                                                  │
│  ▼ Runs: incident-commander run --alert alert.json               │
│                                                                  │
│  State: Supported                                                │
│  The tool ingests the alert, builds a timeline from available    │
│  sources (log files, Slack export, manual entry).               │
│  It correlates recent GitHub PRs/commits with the alert.        │
│  "A PR was merged 12 min before the alert fired."                │
│                                                                  │
│  ▼ Tool drafts first stakeholder update (SEV1 cadence: 5 min)   │
│  ▼ Commander reviews: "Impact: 2% of payments failing..."       │
│  ▼ Commander approves → tool produces pasteable comms block      │
│  ▼ Commander pastes it into Slack/email/whatever they use        │
│                                                                  │
│  State: In control                                               │
│  Every 5 minutes, a new update draft appears. Commander          │
│  reviews, edits if needed, approves, pastes. The cadence         │
│  is maintained without the commander watching the clock.        │
│                                                                  │
│  ▼ Tool suggests remediation: "3 similar incidents in past      │
│    90 days resolved by rollback. Source: INC-2025-088.          │
│    Confidence: 0.82. Simulating rollback would..."               │
│  ▼ Tool dry-runs the remediation: shows expected outcome        │
│    without executing anything                                    │
│  ▼ Commander reviews, decides, executes manually                │
│                                                                  │
│  State: Relieved                                                 │
│  Incident resolved. Tool generates postmortem draft in          │
│  Amazon COE format. Blameless framing. AI sections labeled.     │
│  Commander edits, adds context, saves as markdown.              │
│  Tool produces cost report for the session.                     │
│                                                                  │
│  Exit: Postmortem markdown file + cost report + session data    │
└─────────────────────────────────────────────────────────────────┘
```

**Key decisions at each interrupt:**
- Approve stakeholder update as-is, edit it, or reject and have the tool redraft
- Accept remediation suggestion, reject it, or ask for alternatives
- Approve postmortem draft, edit specific sections, or regenerate with different LLM

### 4.3 Journey 3 — AI/agent developer studying the architecture

> **Emotional arc: curious → engaged → inspired**

```
┌─────────────────────────────────────────────────────────────────┐
│  State: Curious                                                  │
│  "How does a multi-agent system handle incident response        │
│   with human-in-the-loop safety?"                                │
│                                                                  │
│  ▼ Clones repo, reads PRD (this doc) and SPEC                    │
│  ▼ Runs: incident-commander simulate --service demo --severity   │
│         SEV3                                                     │
│                                                                  │
│  State: Engaged                                                  │
│  Sees the state graph, interrupt points, trust hierarchy.       │
│  Reads the safety guardrails doc.                                │
│  Understands: confidence thresholds, citation requirements,     │
│  draft-don't-post pattern, no-exec policy.                       │
│                                                                  │
│  State: Inspired                                                 │
│  "I can adapt this pattern for compliance review, change         │
│   management, or any high-stakes workflow with human             │
│   approval gates."                                               │
└─────────────────────────────────────────────────────────────────┘
```

### 4.4 Journey 4 — Postmortem from saved session

> **Emotional arc: dreading the writeup → pleasantly surprised**

```
┌─────────────────────────────────────────────────────────────────┐
│  State: Dreading                                                 │
│  Incident resolved 2 hours ago. Postmortem is due tomorrow.     │
│  Normally this is a 3-hour writing exercise.                     │
│                                                                  │
│  ▼ Runs: incident-commander postmortem --thread <thread_id>     │
│                                                                  │
│  State: Surprised                                                │
│  Tool loads the saved session, generates a COE-format draft:    │
│  - Timeline (from session state)                                 │
│  - Root cause analysis (LLM, with citations to timeline events)  │
│  - Systemic contributing factors (blameless framing)            │
│  - Action items with suggested owners                            │
│  - AI-generated sections clearly labeled                         │
│                                                                  │
│  ▼ Commander edits: adds context the AI missed, corrects        │
│    any inaccuracies, finalizes action items                      │
│                                                                  │
│  State: Done in 30 minutes                                       │
│  "The AI wrote 80% of it. I edited, not wrote. That's a          │
│   6x improvement."                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Use cases & user stories

### UC-1: SEV1 incident — full lifecycle (simulation mode)

> **As a** new user, **when** I run `incident-commander simulate --service payment-service --severity SEV1`, **I want** to see the full incident lifecycle — timeline built, stakeholder updates drafted, remediation suggested, postmortem generated — **so that** I can evaluate the tool without needing real credentials.

**Scenario:**
1. User runs `incident-commander simulate --service payment-service --severity SEV1`.
2. The simulator generates a fake alert, fake log entries, fake Slack messages, and a fake recent GitHub PR (deploy correlation).
3. The agent builds a live timeline from the simulated multi-source events with trust hierarchy.
4. Every 5 minutes (simulated), the agent drafts a stakeholder update in consequence-first format. The user (acting as commander) reviews and approves via interrupt.
5. The agent produces a pasteable comms block — one for incident notes (could be pasted into PagerDuty), one for stakeholder comms (could be pasted into Slack/email).
6. The agent suggests remediation by pattern-matching against simulated past incidents, with source citations, confidence scores, and a dry-run simulation of the suggested action.
7. Post-incident, the agent generates a postmortem draft in Amazon COE format: timeline, root cause analysis, systemic contributing factors (blameless), action items with owners. AI-generated sections are clearly labeled.
8. The agent produces a cost report for the session (token usage + estimated LLM cost).
9. The user reviews, edits, and the simulation completes.

**Validates:** Simulation mode, full lifecycle, interrupt-based approval, timeline trust hierarchy, stakeholder update drafting, deploy correlation, dry-run remediation simulation, postmortem generation, cost tracking, pasteable output format.

### UC-2: Real SEV1 — alert-driven response

> **As an** incident commander, **when** a real alert fires, **I want** the agent to ingest the alert, build a timeline from available sources, correlate recent deploys, and draft stakeholder updates for my approval — **so that** I can focus on diagnosis instead of typing updates.

**Scenario:**
1. An alert fires for `payment-service` with severity SEV1. The commander has the alert as a JSON file.
2. `incident-commander run --alert alert.json` starts the agent in the terminal (foreground CLI).
3. The agent ingests the alert and builds a timeline from available sources (log files, manual event entry, GitHub deploy correlation).
4. The agent correlates recent GitHub PRs/commits: "PR #4892 merged 12 min before alert. Changed: `payment_processor.py`. Author: @jdoe."
5. Every 5 minutes (SEV1 cadence), the agent drafts a stakeholder update: "Impact: 2% of payment attempts failing. Root cause: suspected DB connection pool exhaustion. Action: rolling back recent deploy. Next update in 5 minutes."
6. The commander reviews the draft via CLI interrupt. Approves → tool produces pasteable comms block. Rejects → agent redrafts.
7. The agent suggests remediation: "3 similar incidents in the last 90 days were resolved by rollback. Source: incident INC-2025-088. Confidence: 0.82." The agent dry-runs the rollback: "Expected outcome: payment success rate returns to >99% within 2 minutes of rollback."
8. The commander reviews the suggestion, decides, and executes the rollback manually (the tool never executes).
9. Post-incident, the agent generates a postmortem draft in COE format. The commander edits, approves, and the draft is saved as markdown.

**Validates:** Real alert ingestion, deploy correlation, live timeline, severity-driven cadence, interrupt-based approval, remediation with citations + dry-run, COE postmortem, pasteable output.

### UC-3: Postmortem from existing incident session

> **As an** incident commander, **after** the incident is resolved, **I want** to generate or regenerate a postmortem from the saved session — **so that** I can edit it with fresh context or try a different LLM for the draft.

**Scenario:**
1. The incident is resolved. The session is saved locally.
2. The commander runs `incident-commander postmortem --thread <thread_id>`.
3. The agent loads the full incident state from the saved session.
4. The agent generates a postmortem draft: timeline (from state), root cause analysis (LLM with citations), systemic contributing factors (blameless), action items with suggested owners.
5. AI-generated sections are clearly labeled for reviewer scrutiny.
6. The commander edits the draft, adds context the AI missed, and saves the final version as markdown.

**Validates:** Session persistence, postmortem regeneration, AI/human section labeling, COE format.

### UC-4: Timeline review during incident

> **As an** incident commander, **during** an active incident, **I want** to view the current timeline at any point — **so that** I can see what's happened, in what order, from which sources, without scrolling through chat.

**Scenario:**
1. During an active incident, the commander runs `incident-commander timeline --thread <thread_id>`.
2. The agent displays the current timeline: chronological events, source attribution, trust level indicators, deploy correlation markers.
3. The commander sees: "14:03 Alert fired (trust: high) → 14:04 PR #4892 merged (trust: high, deploy correlation) → 14:07 Log: error rate spike (trust: medium) → 14:09 Engineer: 'I think it's the connection pool' (trust: low — human-entered)".
4. The commander uses this to brief incoming responders or validate root cause hypotheses.

**Validates:** Timeline retrieval, trust hierarchy display, deploy correlation, session persistence.

### UC-5: Developer studying the architecture

> **As an** AI/agent developer, **I want** to study the state graph, interrupt patterns, and safety guardrails — **so that** I can learn how to build production-grade agentic systems for high-stakes workflows.

**Scenario:**
1. Developer clones the repo, reads `docs/PRD.md` and `docs/SPEC.md`.
2. Runs `incident-commander simulate --service demo --severity SEV3` to see the full workflow.
3. Reads the state graph definition to understand: nodes, edges, interrupt points, cycle for stakeholder updates.
4. Reads the stakeholder update node to see how the interrupt pattern works — draft → interrupt → approve/reject/edit → produce pasteable output / redraft.
5. Reads `docs/safety-guardrails.md` to understand confidence thresholds, source citation requirements, and the "draft, don't post" pattern.
6. Adapts the patterns for their own agentic workflow (e.g., compliance review, change management).

**Validates:** Reference architecture value, documentation quality, simulation mode as learning tool.

---

## 6. Competitive analysis

### 6.1 Feature matrix

| Feature | ai-incident-commander | HolmesGPT | sre-warroom | sre-copilot | PagerDuty Copilot | ilert AI | Incident.io | RAGoncall |
|---|---|---|---|---|---|---|---|---|
| Full lifecycle (war room → PM) | ✅ | ❌ (investigate only) | ✅ (5 agents) | ❌ (chat only) | ❌ (Scribe only) | ❌ (PM only) | ❌ (platform) | ❌ (RAG only) |
| Simulation mode (zero creds) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Human approval at every action | ✅ | ❌ | ✅ (dry-run) | ❌ | ✅ | ❌ | N/A | N/A |
| Timeline with trust hierarchy | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ (manual) | ❌ |
| Stakeholder update drafting | ✅ | ❌ | ❌ | ❌ | ✅ (audience-specific) | ❌ | ❌ | ❌ |
| Consequence-first format | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Severity-driven cadence | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| GitHub deploy correlation | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Dry-run remediation simulation | ✅ | ✅ (remediation PRs) | ✅ (dry-run) | ❌ | ❌ | ❌ | ❌ | ❌ |
| Evidence reranking | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Blameless COE postmortem | ✅ | ❌ | ✅ (PM agent) | ❌ | ✅ (Scribe) | ✅ (AI PM) | ❌ | ❌ |
| AI/human section labeling | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Cost tracking per incident | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| LLM observability per node | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Pre-built scenario library | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Pasteable output (no integration needed) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Open source | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| pip-installable | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### 6.2 Why ai-incident-commander is different

| Competitor | What they do | Why they're not enough | Our advantage |
|---|---|---|---|
| **HolmesGPT** (2.8k stars) | AI SRE investigation across K8s/Datadog/Prometheus; can open remediation PRs | Investigation only — no stakeholder comms, no postmortem, no simulation mode, no human-in-the-loop | Full lifecycle with human approval; simulation mode for zero-credential evaluation; pasteable output |
| **sre-warroom** (0 stars) | 5-agent pipeline: triage → runbook → executor → postmortem → cost | No simulation mode, no adoption, no human-in-the-loop approval, no pasteable output | Simulation mode, human approval at every action, pasteable output, pre-built scenarios |
| **sre-copilot** (12 stars) | Chat-based SRE assistant with Datadog/K8s/PagerDuty read | Chat-only, no timeline, no postmortem, no simulation, requires real integrations | Full lifecycle, simulation mode, works without any integrations |
| **PagerDuty Copilot** | Scribe (Zoom transcription), Insights, audience-specific updates | Commercial, locked to PagerDuty, no simulation mode, no open source | Open source, pip-installable, simulation mode, not locked to any platform |
| **ilert AI** | AI postmortems from chat messages, pattern identification | Commercial, postmortem-only, no timeline, no comms drafting | Full lifecycle, open source, blameless COE format, cost tracking |
| **Incident.io** | War room, status pages, manual timelines | Commercial SaaS, manual timeline, no AI drafting | AI-drafted everything, open source, automatic timeline with trust hierarchy |
| **RAGoncall** | Runbook RAG for on-call | Retrieval only — no war room, timeline, comms, or postmortem | Standalone RAG + full incident lifecycle orchestration |

### 6.3 Positioning

```
                  Alerting        In-incident         Post-incident
                  ────────        ──────────          ─────────────
Alerting/routing:  PagerDuty,     ─                   ─
                   Opsgenie
Investigation:     ─              HolmesGPT,          ─
                                   sre-copilot
Runbook retrieval: ─              RAGoncall,          ─
                                   Robusta
Timeline:          ─              Incident.io         ─
                                   (manual)
Stakeholder comms: ─              PagerDuty Copilot   ─
                                   (commercial)
Postmortem:        ─              ─                   ilert AI,
                                                       Collablog
Full lifecycle     ─              ai-incident-        ai-incident-
(AI-driven,                           commander           commander
 open source,
 human-in-the-
 loop):
```

ai-incident-commander owns the **full lifecycle, AI-driven, open source, human-in-the-loop** row. Nobody else does.

### 6.4 SWOT

| | Positive | Negative |
|---|---|---|
| **Internal** | **Strengths:** Full lifecycle coverage; simulation mode (zero credentials); human-in-the-loop safety; pasteable output (no integration required); open source MIT; pip-installable; blameless COE postmortem; cost tracking; LLM observability; pre-built scenario library; deploy correlation; evidence reranking; dry-run remediation | **Weaknesses:** No direct Slack/PagerDuty integration in v0.1.0 (pasteable output only); single LLM audience for comms; single incident per session; no web UI; no real-time log streaming; new project with no adoption yet |
| **External** | **Opportunities:** First open-source full-lifecycle AI incident commander; reference architecture for agentic AI in high-stakes domains; growing interest in AI-assisted SRE; LangGraph ecosystem expanding; teams want tools that work without locking into a platform | **Threats:** HolmesGPT has 2.8k stars and mindshare; PagerDuty/ilert have commercial resources; adoption risk — teams may be skeptical of AI during incidents; LLM quality risk — hallucinations during incidents are high-stakes; scope creep from integration requests |

---

## 7. Goals & non-goals

### 7.1 Goals — what ai-incident-commander WILL do

| # | Goal | Why it matters |
|---|---|---|
| G1 | Build a live timeline from multi-source events with trust hierarchy | Gives the commander a single chronological view instead of scrolling chat + logs + dashboards |
| G2 | Draft stakeholder updates in consequence-first format on a severity-driven cadence | Standardizes communication; drafts for approval, doesn't auto-post; SEV1=5min, SEV2=15min, SEV3=30min |
| G3 | Produce pasteable output — incident notes block + stakeholder comms block | Works without any platform integration in v0.1.0; commander pastes into whatever tools they use |
| G4 | Correlate recent GitHub PRs/commits/deploys with the incident | "A PR was merged 12 min before the alert" is critical context for root cause |
| G5 | Suggest remediations by pattern-matching past incidents with citations, confidence, and dry-run simulation | Surfaces institutional knowledge; dry-run shows expected outcome without executing |
| G6 | Rerank evidence by relevance when retrieving runbooks/past incidents | Quality-filtered results, not just top-k; better suggestions |
| G7 | Generate postmortem drafts in Amazon COE format with blameless framing and AI/human section labeling | Turns 3-hour drafting into 30-minute editing; blameless = "what failed" not "who failed" |
| G8 | Track cost per incident session (token usage + estimated LLM cost) | Makes LLM economics visible; aligns with cost-conscious ecosystem |
| G9 | Provide LLM observability per agent node (prompt, response, tokens, latency) | Debugging and cost analysis; every LLM call is logged |
| G10 | Ship pre-built incident scenario library (5-8 realistic scenarios) | Demo, testing, and onboarding without needing real data |
| G11 | Support both simulation mode (no credentials) and real integration mode | Users evaluate the tool instantly; teams deploy with real data |
| G12 | Ship as a pip-installable package with foreground CLI | `pip install ai-incident-commander` then `incident-commander simulate` — no daemon, no server |
| G13 | Serve as a reference architecture for production-grade agentic workflows | State graph, interrupt patterns, safety guardrails, multi-source data fusion — all demonstrated in a real-world use case |

### 7.2 Non-goals — what ai-incident-commander will NOT do

| # | Non-goal | Why |
|---|---|---|
| NG1 | **Not an automated remediation tool.** The agent suggests and dry-runs; the human decides and executes. | Incidents are too high-stakes for autonomous AI action. The agent never executes a production change. |
| NG2 | **Not a monitoring replacement.** The agent does not detect incidents — it responds to alerts from existing tools. | PagerDuty, Datadog, Prometheus already do detection well. We orchestrate the response. |
| NG3 | **Not an incident management platform.** No on-call scheduling, no alert routing, no status pages. | PagerDuty and Incident.io do this. We complement them, not replace them. |
| NG4 | **Not a postmortem storage system.** The agent generates drafts; storage is the team's existing wiki/tool. | Confluence, Notion, GitLab all do storage. We generate the content. |
| NG5 | **Not a decision-maker.** Every action — producing comms, suggesting remediations, generating postmortems — requires human approval. | Trust is destroyed instantly if the AI hallucinates during an incident. Human approval is the safety net. |
| NG6 | **Not a Slack bot or chat framework.** v0.1.0 produces pasteable output; it does not post to Slack or any platform. | Platform integrations are v0.2.0+. v0.1.0 works without any platform credentials. |
| NG7 | **Not a hosted service.** No SaaS, no cloud deployment, no freemium tier. | Always MIT, always free, always self-hosted. No hosting costs, no data leaves the user's machine. |

### 7.3 Explicit out-of-scope examples (expected feature requests we will reject)

| Expected request | Response | Redirect to |
|---|---|---|
| "Add auto-rollback when the AI is confident enough" | Out of scope — the agent never executes production changes (NG1) | Your CD pipeline (Argo CD, Spinnaker) |
| "Add on-call schedule management" | Out of scope — that's alerting platform functionality (NG3) | PagerDuty, Opsgenie |
| "Add a status page" | Out of scope — that's incident management platform functionality (NG3) | Incident.io, Atlassian Statuspage |
| "Post directly to Slack" | Out of scope for v0.1.0 — pasteable output only (NG6). v0.2.0 will add direct integration | Slack API, Bolt framework |
| "Auto-publish postmortem to Confluence" | Out of scope — we generate drafts, storage is external (NG4) | Confluence API, Notion API, GitLab Wiki |
| "Let the AI decide when to escalate to leadership" | Out of scope — the commander decides, not the AI (NG5) | Human judgment |
| "Offer a hosted/SaaS version" | Out of scope — always self-hosted, always MIT (NG7) | Self-host on your infrastructure |

---

## 8. Assumptions & constraints

### 8.1 Assumptions

| # | Assumption | Rationale |
|---|---|---|
| A1 | The user wants an **assistant, not an autonomous agent** | Safety-critical context. The "draft, don't post" pattern is core to the product. |
| A2 | The user's incident response follows a **timeline → updates → remediation → postmortem** lifecycle | This is the industry-standard incident response workflow. |
| A3 | Stakeholder updates should follow **consequence-first** format (impact → cause → action → next update) | Clear communication under pressure requires structure. |
| A4 | The user has a **local LLM (OMLX/Ollama)** for analysis and optionally a **cloud LLM** for complex generation | Cost-conscious LLM routing is the established pattern in this project ecosystem. |
| A5 | The user does NOT have Slack/PagerDuty credentials in v0.1.0 | v0.1.0 produces pasteable output. No platform integration required. |
| A6 | The user uses a **foreground CLI session** — the tool runs in the terminal, blocks at decision points, and waits for input | v0.1.0 interaction model. No daemon, no server, no background process. |
| A7 | Postmortems follow **Amazon COE (Correction of Errors)** format | Blameless, structured, focuses on systemic factors. |
| A8 | Stakeholder updates target a **single audience** in v0.1.0 | Multi-audience templates (exec vs engineering) are v0.2.0. |
| A9 | The user can provide an alert as a **JSON file** | Minimal input format. Works with any alerting system that can export JSON. |

### 8.2 Constraints

| # | Constraint | Detail |
|---|---|---|
| C1 | **License:** MIT | Must remain permissive; no GPL or copyleft dependencies |
| C2 | **Distribution:** PyPI + GitHub | `pip install ai-incident-commander` for library/CLI; clone for development |
| C3 | **No telemetry or phone-home** | The tool does not collect, transmit, or report usage data. Ever. |
| C4 | **Python 3.11+** | Locks the feature set (modern typing, match statements). No 3.10 support. |
| C5 | **No C extensions or compiled code** | Pure Python. Maximizes portability. |
| C6 | **Human approval required for all external actions** | Producing comms blocks, suggesting remediations, generating postmortems — all require human approval via interrupt. |
| C7 | **AI-generated content must be labeled** | Postmortem sections generated by the AI are clearly marked so reviewers know what to scrutinize. |
| C8 | **Local model compatibility** | Must work with OMLX-served models (Qwen, Llama, DeepSeek) and Ollama, not just cloud APIs. |
| C9 | **No platform integration in v0.1.0** | No Slack API calls, no PagerDuty API calls. Output is pasteable markdown/text blocks. |
| C10 | **Foreground CLI only in v0.1.0** | No daemon, no server, no background process. The tool runs in the terminal and blocks at decision points. |

---

## 9. Success metrics

### 9.1 Product success — how we know the tool works

| Metric | Target | How to measure |
|---|---|---|
| Stakeholder update consistency | 100% of updates follow consequence-first format | Check all drafted updates in field study |
| Postmortem drafting time | <30 min editing (vs 3 hours from scratch) | Field study: time commander editing AI draft vs writing from scratch |
| Timeline completeness | >90% of incident events captured | Field study: compare AI timeline vs manual retrospective timeline |
| Deploy correlation accuracy | Correctly identifies deploy within 30 min of alert when one exists | Field study: test against known deploy-correlated incidents |
| Remediation suggestion relevance | >70% of suggestions rated "relevant" by commander | Field study: commander rates each suggestion |
| Simulation mode value | New user can see full lifecycle in <5 minutes with zero credentials | User test: install, simulate, see output |
| Cost transparency | Every session produces a cost report with per-node token breakdown | Verify cost report in every E2E test |

### 9.2 Adoption success — how we know the market wants this

| Metric | v0.1.0 target (first 30 days public) | v0.2.0 target (90 days) |
|---|---|---|
| GitHub stars | 50+ | 200+ |
| PyPI downloads | 100+ | 1,000+ |
| External issues opened | 3+ | 10+ |
| External PRs merged | 1+ | 3+ |
| Good first issues claimed | 2+ | 5+ |

### 9.3 Quality bar — how we know the tool is trustworthy

| Metric | Target |
|---|---|
| Test coverage | ≥80% on core modules |
| CI passing | 100% on main across Python 3.11/3.12 |
| Type check clean | `mypy --strict` passes |
| Lint clean | `ruff check` passes |
| Zero known security vulnerabilities | `pip-audit` clean |
| Simulation mode works with zero credentials | Verified in CI (no env vars set) |
| All external actions require human approval | Verified by integration tests (no action without interrupt) |
| Every LLM call is logged with tokens + latency | Verified by LLM observability tests |
| Every session produces a cost report | Verified by E2E tests |

---

## 10. Functional requirements

### 10.1 Incident simulation (FR-1)

| ID | Requirement | Priority |
|---|---|---|
| FR-1.1 | The tool MUST provide a simulation mode that generates fake alerts, logs, Slack messages, and GitHub PRs | P0 |
| FR-1.2 | The simulation MUST be configurable: service name, severity, number of log lines, number of messages, number of PRs | P0 |
| FR-1.3 | The simulation MUST produce reproducible output (seeded random) for testing | P1 |
| FR-1.4 | The simulation MUST work with zero external credentials (no Slack token, no PagerDuty key, no LLM API key, no GitHub token) | P0 |
| FR-1.5 | The simulation MUST demonstrate the full lifecycle: timeline → updates → remediation → postmortem → cost report | P0 |
| FR-1.6 | The tool MUST ship a pre-built scenario library (5-8 scenarios: SEV1 outage, SEV2 degradation, security incident, dependency failure, etc.) | P1 |

### 10.2 Timeline construction (FR-2)

| ID | Requirement | Priority |
|---|---|---|
| FR-2.1 | The tool MUST merge events from multiple sources (alerts, logs, chat messages, GitHub PRs, manual entry) into a single chronological timeline | P0 |
| FR-2.2 | The tool MUST assign a trust level to each event: alert/PagerDuty (high), chat/Slack (high), GitHub (high), logs (medium), human-entered (low) | P0 |
| FR-2.3 | The tool MUST flag human-entered events with lower trust in the timeline display | P0 |
| FR-2.4 | The tool MUST provide a human-readable timeline summary for display | P0 |
| FR-2.5 | The tool MUST support adding events to the timeline during an active incident | P1 |
| FR-2.6 | The tool MUST persist the timeline across sessions | P0 |
| FR-2.7 | The tool MUST display deploy correlation markers when a GitHub PR/commit is within 30 minutes of an alert | P0 |

### 10.3 GitHub deploy correlation (FR-3)

| ID | Requirement | Priority |
|---|---|---|
| FR-3.1 | The tool MUST correlate recent GitHub PRs/commits with the incident alert timestamp | P0 |
| FR-3.2 | The tool MUST display: PR number, title, author, merge time, files changed | P0 |
| FR-3.3 | The tool MUST flag PRs merged within 30 minutes before the alert as "deploy correlation" | P0 |
| FR-3.4 | The tool MUST work with a GitHub JSON export (no API token required in v0.1.0) | P0 |
| FR-3.5 | The tool MUST support direct GitHub API integration as an optional capability (when token provided) | P1 |

### 10.4 Stakeholder communication (FR-4)

| ID | Requirement | Priority |
|---|---|---|
| FR-4.1 | The tool MUST draft stakeholder updates in consequence-first format: impact, root cause hypothesis, action, next update time | P0 |
| FR-4.2 | The tool MUST draft updates on a severity-driven cadence: SEV1=5 min, SEV2=15 min, SEV3=30 min | P0 |
| FR-4.3 | The tool MUST present the draft to the commander for approval via interrupt — draft, don't post | P0 |
| FR-4.4 | The tool MUST produce a pasteable comms block after approval — one for incident notes, one for stakeholder comms | P0 |
| FR-4.5 | The tool MUST redraft if the commander rejects | P1 |
| FR-4.6 | The tool MUST use a clinical, precise tone — no emojis, no casual language | P0 |
| FR-4.7 | The tool MUST suppress suggestions below a configurable confidence threshold (default: 0.7) | P1 |
| FR-4.8 | The tool MUST target a single audience in v0.1.0 (no audience-specific templates) | P0 |

### 10.5 Remediation suggestion (FR-5)

| ID | Requirement | Priority |
|---|---|---|
| FR-5.1 | The tool MUST pattern-match the current incident against past incidents in the knowledge base | P0 |
| FR-5.2 | The tool MUST present suggestions with source citations: "Source: incident INC-2025-088" | P0 |
| FR-5.3 | The tool MUST include a confidence score with every suggestion | P0 |
| FR-5.4 | The tool MUST present suggestions for commander review via interrupt — suggest, don't execute | P0 |
| FR-5.5 | The tool MUST NEVER execute a production change (rollback, deploy, scale) | P0 |
| FR-5.6 | The tool MUST suppress suggestions below the confidence threshold | P1 |
| FR-5.7 | The tool MUST dry-run suggested remediations: show expected outcome without executing | P1 |
| FR-5.8 | The tool MUST rerank evidence by relevance before presenting suggestions (not just top-k retrieval) | P1 |

### 10.6 Postmortem generation (FR-6)

| ID | Requirement | Priority |
|---|---|---|
| FR-6.1 | The tool MUST generate a postmortem draft in Amazon COE (Correction of Errors) format | P0 |
| FR-6.2 | The postmortem MUST include: full timeline, root cause analysis, systemic contributing factors (blameless), action items with suggested owners | P0 |
| FR-6.3 | The tool MUST use blameless framing: "what failed" not "who failed"; focus on systemic factors, not individual mistakes | P0 |
| FR-6.4 | The tool MUST clearly label AI-generated sections so reviewers know what to scrutinize | P0 |
| FR-6.5 | The tool MUST present the postmortem draft for commander review via interrupt | P0 |
| FR-6.6 | The tool MUST support regenerating the postmortem from a saved session | P1 |
| FR-6.7 | The tool MUST NOT auto-publish the postmortem — the commander saves it manually as markdown | P0 |
| FR-6.8 | The tool MUST produce the postmortem as a markdown file (portable, pasteable) | P0 |

### 10.7 Runbook retrieval & evidence reranking (FR-7)

| ID | Requirement | Priority |
|---|---|---|
| FR-7.1 | The tool MUST query a knowledge base for relevant runbooks based on service and symptoms | P0 |
| FR-7.2 | The tool MUST query for similar past incidents based on service and symptoms | P0 |
| FR-7.3 | The tool MUST return sources with citations (runbook path + section) | P0 |
| FR-7.4 | The tool MUST support a configurable retriever (injectable protocol for testing) | P0 |
| FR-7.5 | The tool MUST include pre-indexed demo runbooks for simulation mode | P0 |
| FR-7.6 | The tool MUST rerank retrieved evidence by relevance to current symptoms before presenting | P1 |

### 10.8 Cost tracking & LLM observability (FR-8)

| ID | Requirement | Priority |
|---|---|---|
| FR-8.1 | The tool MUST track token usage (input + output) per LLM call | P0 |
| FR-8.2 | The tool MUST estimate cost per LLM call based on model pricing | P0 |
| FR-8.3 | The tool MUST aggregate cost per incident session | P0 |
| FR-8.4 | The tool MUST produce a cost report at the end of each session: per-node breakdown + total | P0 |
| FR-8.5 | The tool MUST log every LLM call with: node name, prompt, response, token count, latency, model used | P0 |
| FR-8.6 | The tool MUST make LLM logs available for debugging (structured JSON or JSONL) | P0 |

### 10.9 Configuration & CLI (FR-9)

| ID | Requirement | Priority |
|---|---|---|
| FR-9.1 | The tool MUST provide a CLI with commands: `simulate`, `run`, `timeline`, `postmortem` | P0 |
| FR-9.2 | The tool MUST accept configuration via environment variables (.env file) | P0 |
| FR-9.3 | The tool MUST provide a typed configuration model (Pydantic) with validation | P0 |
| FR-9.4 | The tool MUST provide sensible defaults for all configuration | P0 |
| FR-9.5 | The tool MUST support `--simulate` flag on all commands for zero-credential operation | P0 |
| FR-9.6 | The tool MUST run as a foreground CLI session — block at decision points, wait for user input | P0 |

### 10.10 Session persistence (FR-10)

| ID | Requirement | Priority |
|---|---|---|
| FR-10.1 | The tool MUST persist incident sessions locally | P0 |
| FR-10.2 | The tool MUST support resuming an incident session by thread ID | P0 |
| FR-10.3 | The tool MUST support generating a timeline from a saved session | P0 |
| FR-10.4 | The tool MUST support generating a postmortem from a saved session | P0 |
| FR-10.5 | The tool MUST store session data locally — no cloud transmission | P0 |
| FR-10.6 | The tool MUST support exporting session data as JSON (no lock-in) | P1 |

---

## 11. Non-functional requirements

### 11.1 Compatibility

| Requirement | Detail |
|---|---|
| Python | 3.11, 3.12 |
| OS | Linux, macOS (Windows not prioritized for v0.1.0 — incident response is server-side) |
| Local models | OMLX (Qwen, Llama, DeepSeek), Ollama |
| Cloud models | OpenAI, Anthropic (optional — simulation mode works without any LLM API key) |
| GitHub | GitHub JSON export (no token required) or GitHub API (optional, when token provided) |

### 11.2 Performance

| Requirement | Target |
|---|---|
| Timeline construction | <2 seconds for 100 events from 3 sources |
| Stakeholder update drafting | <10 seconds for LLM to generate draft |
| Postmortem generation | <30 seconds for LLM to generate draft |
| Simulation startup | <5 seconds from command to first output |
| Deploy correlation | <1 second to correlate PRs within 30-min window |
| Evidence reranking | <2 seconds for 50 retrieved documents |

### 11.3 Reliability

| Requirement | Detail |
|---|---|
| The tool MUST NOT produce output without human approval | Interrupt before every external action (comms, postmortem) |
| The tool MUST NOT execute production changes | Suggestions and dry-runs only; human executes |
| The tool MUST fail gracefully if a source is unavailable | Log error, continue with available sources, notify commander |
| The tool MUST handle LLM failures gracefully | If LLM fails to draft an update, log error, let commander write manually |
| The tool MUST handle empty knowledge base gracefully | No runbooks/past incidents found → state "no historical data available" and continue |
| Session state MUST survive process restarts | Persisted locally; resumable by thread ID |
| The tool MUST handle commander disconnect mid-session | Session state persisted; commander can resume with `run --thread <thread_id>` |

### 11.4 Security

| Requirement | Detail |
|---|---|
| No hardcoded API keys or endpoints | All credentials from user's environment/config |
| No telemetry or phone-home | Tool does not collect or transmit usage data |
| Simulation mode leaves no traces | No API calls, no external communication, no cloud transmission |
| Incident data retention | Configurable; default: sessions stored locally, no cloud transmission |
| Session data exportable | JSON export; no lock-in; user controls their data |
| No platform credentials required in v0.1.0 | No Slack token, no PagerDuty key, no GitHub token (unless user opts in for API mode) |

### 11.5 Developer experience

| Requirement | Detail |
|---|---|
| Time to first value | New user runs `pip install ai-incident-commander` then `incident-commander simulate` in <5 minutes |
| API discoverability | Full type annotations; IDE autocomplete for all public APIs |
| Error messages | All user-facing errors are actionable (what went wrong + how to fix) |
| Simulation as learning tool | `--simulate` flag on every command so developers can explore without credentials |
| Foreground CLI clarity | Terminal output is readable, structured, and shows what the agent is doing at each step |

---

## 12. Interaction model

### 12.1 Foreground CLI session

v0.1.0 uses a **foreground CLI session** model. The tool runs in the terminal, progresses through the incident lifecycle, and **blocks at decision points** waiting for the commander's input.

```
┌────────────────────────────────────────────────────────┐
│  $ incident-commander simulate --service payment \     │
│    --severity SEV1                                     │
│                                                        │
│  [14:00:00] Alert received: payment-service SEV1       │
│  [14:00:01] Building timeline from 4 sources...        │
│  [14:00:02] Timeline: 12 events merged                 │
│  [14:00:03] Deploy correlation: PR #4892 merged at     │
│             13:48 (12 min before alert)                 │
│  [14:00:04] Timeline complete. Starting update cycle.  │
│                                                        │
│  ── Stakeholder Update Draft #1 ────────────────────   │
│  Impact: 2% of payment attempts failing since 14:03    │
│  Root cause: Suspected DB connection pool exhaustion   │
│  Action: Investigating rollback of PR #4892            │
│  Next update: 14:10 (5 min)                            │
│  ──────────────────────────────────────────────────    │
│                                                        │
│  [a] Approve  [e] Edit  [r] Reject (redraft)  [q] Quit │
│  > _                                                   │
│                                                        │
│  (blocks here until commander chooses)                 │
└────────────────────────────────────────────────────────┘
```

### 12.2 Decision points (interrupts)

| Decision point | What the commander sees | Options |
|---|---|---|
| Stakeholder update approval | Draft in consequence-first format | Approve → produce pasteable block; Edit → modify then approve; Reject → redraft |
| Remediation suggestion review | Suggestion with citation, confidence, dry-run outcome | Accept → note for postmortem; Reject → continue; Ask alternatives → retrieve more |
| Postmortem review | COE-format draft with AI sections labeled | Approve → save as markdown; Edit sections → modify then save; Regenerate → try different LLM |

### 12.3 Pasteable output format

After approval, the tool produces two blocks the commander can paste into their tools:

**Incident notes block** (for PagerDuty, ticketing, etc.):
```
## Incident Notes — payment-service SEV1
### Timeline
- 14:03 Alert fired (source: PagerDuty, trust: high)
- 13:48 PR #4892 merged (source: GitHub, trust: high, deploy correlation)
- 14:07 Error rate spike (source: logs, trust: medium)
...
### Remediation
- Suggested: Rollback PR #4892. Confidence: 0.82.
- Source: INC-2025-088 (resolved by rollback)
- Dry-run: Expected outcome — payment success >99% within 2 min
```

**Stakeholder comms block** (for Slack, email, etc.):
```
## SEV1 — Payment Service Degradation

**Impact:** 2% of payment attempts failing since 14:03 UTC.
**Root cause:** Suspected DB connection pool exhaustion, potentially
triggered by PR #4892 (merged 12 min before first error).
**Action:** Rolling back PR #4892. Verifying recovery.
**Next update:** 14:10 UTC (5 minutes).
```

### 12.4 v0.2.0 interaction model (daemon mode)

v0.2.0 will add a **daemon mode** — the tool runs in the background, monitors for alerts, and posts directly to Slack/PagerDuty. This is out of scope for v0.1.0.

---

## 13. Edge cases

| # | Edge case | Handling |
|---|---|---|
| E1 | **24h+ incident** — commander needs to hand off to next shift | Session persisted locally; new commander runs `run --thread <thread_id>` to resume. Timeline, updates, and state preserved. |
| E2 | **Concurrent incidents** — two SEV1s at the same time | v0.1.0: one incident per session. Commander runs separate sessions. v0.2.0: multi-incident support. |
| E3 | **LLM failure mid-draft** — the LLM returns an error or garbage during stakeholder update drafting | Tool logs the error, displays "LLM failed to draft update. Please write manually.", and continues the cadence cycle. Commander can type a manual update. |
| E4 | **Empty knowledge base** — no runbooks or past incidents indexed | Tool states "No historical data available. Remediation suggestions disabled." and continues without suggestions. |
| E5 | **Commander disconnects mid-session** — terminal closes, network drops | Session state is persisted at each interrupt point. Commander reconnects and resumes with `run --thread <thread_id>`. |
| E6 | **No deploy correlation found** — no recent PRs within 30-min window | Tool states "No recent deploys correlated with alert." and continues. |
| E7 | **All sources unavailable** — no logs, no chat, no GitHub data | Tool states "No external sources available. Timeline will contain only manually entered events." and continues. |
| E8 | **Very long timeline** — 500+ events | Tool paginates timeline display (50 events per page) and provides a summary view. |
| E9 | **Confidence threshold filters all suggestions** — no suggestion meets threshold | Tool states "No high-confidence remediation suggestions available. Consider lowering threshold or adding more runbooks to the knowledge base." |
| E10 | **Postmortem regeneration with different LLM** — commander wants to try a cloud LLM for the draft | Tool supports `postmortem --thread <thread_id> --model <model_name>` to regenerate with a different LLM. Previous draft is saved as a version. |

---

## 14. Data privacy & handling

### 14.1 What data the tool sees

| Data type | Where it comes from | Where it stays |
|---|---|---|
| Alert JSON | User-provided file | Local (session state) |
| Log entries | User-provided files or simulation | Local (session state) |
| Chat messages | User-provided export or simulation | Local (session state) |
| GitHub PRs | User-provided JSON export or GitHub API (optional) | Local (session state) |
| Runbooks | Local knowledge base (simulated or real) | Local (session state) |
| Past incidents | Local knowledge base (simulated or real) | Local (session state) |
| LLM prompts | Generated by the tool from incident data | Sent to LLM (local or cloud — user's choice) |
| LLM responses | From the LLM | Local (session state) |

### 14.2 Data flow

```
┌─────────────────────────────────────────────────────────────────┐
│  User's machine (trusted)                                        │
│                                                                  │
│  Alert JSON ──┐                                                  │
│  Log files ───┤                                                  │
│  Chat export ─┤──▶  Incident Commander  ──▶  Session state       │
│  GitHub JSON ─┤    (local process)          (local, persisted)   │
│  Runbooks ────┘                                                  │
│                         │                                        │
│                         ▼                                        │
│                   ┌───────────┐                                  │
│                   │   LLM     │  ← local (OMLX/Ollama) or        │
│                   │           │    cloud (OpenAI/Anthropic)      │
│                   └───────────┘    (user's choice)               │
│                         │                                        │
│                         ▼                                        │
│                   Pasteable output                                │
│                   (markdown blocks —                              │
│                    user pastes where they want)                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 14.3 Privacy guarantees

| Guarantee | Detail |
|---|---|
| No cloud transmission of incident data | Session data stays local. Only LLM prompts are sent to the LLM (which may be local or cloud — user's choice). |
| User controls LLM choice | Local LLM (OMLX/Ollama) = zero data leaves the machine. Cloud LLM = user opts in. |
| No telemetry | The tool does not phone home, report usage, or send analytics. Ever. |
| Session data is local and exportable | Stored locally. Exportable as JSON. User controls retention and deletion. |
| No platform credentials required in v0.1.0 | No Slack, PagerDuty, or GitHub tokens needed (unless user opts in for GitHub API mode). |
| Simulation mode produces no real data | All data is synthetic. No real service names, no real logs, no real PRs. |

### 14.4 Data retention

| Setting | Default | Configurable |
|---|---|---|
| Session data location | `~/.incident-commander/sessions/` | Yes (via env var) |
| Session data retention | No auto-deletion (user manages) | Yes (configurable max age) |
| LLM logs | `~/.incident-commander/logs/` | Yes (via env var) |
| LLM log format | JSONL (one line per LLM call) | No (standard format for tooling) |
| Cost reports | Saved with session | No (always saved) |

---

## 15. Threat model

### 15.1 Overview

ai-incident-commander processes potentially sensitive production data (error logs, service names, incident details) and drafts communication that goes to stakeholders. It may send data to an LLM (local or cloud). The threat model identifies risks and the requirements that mitigate them.

### 15.2 Threats

| ID | Threat | Description | Impact | Mitigation (FR ref) |
|---|---|---|---|---|
| **T1** | **AI hallucination during incident** | The LLM generates incorrect information in a stakeholder update or remediation suggestion — wrong root cause, wrong impact assessment, wrong remediation. | High — stakeholders misinformed, wrong action taken | FR-4.3/FR-5.4: Human approval via interrupt before any output. FR-4.7/FR-5.6: Confidence threshold suppresses low-confidence output. FR-5.2: Source citations required. |
| **T2** | **Sensitive data leakage to cloud LLM** | Incident details (error logs, service names, internal hostnames) sent to a cloud LLM for drafting. | Medium — data exposed to third party | C8: Local LLM as default for analysis. Cloud LLM only when user opts in. §14: User controls LLM choice. |
| **T3** | **Commander acts on hallucinated suggestion** | The commander approves a remediation suggestion that is wrong because the LLM hallucinated. | High — wrong action taken during incident | FR-5.7: Dry-run shows expected outcome. FR-5.2: Source citations. FR-5.3: Confidence score. Human judgment is final safety net. |
| **T4** | **Production change execution** | The tool executes a rollback, deploy, or scaling action autonomously. | Critical — unauthorized production change during incident | NG1/FR-5.5: The tool NEVER executes production changes. Suggestions and dry-runs only. Architecture has no execution capability. |
| **T5** | **Supply chain compromise** | A dependency is compromised with malicious code. | Medium — code execution, data exfiltration | §11.4: Dependencies pinned. `pip-audit` in CI. Review new dependencies before adding. |
| **T6** | **Session data exposure** | Incident sessions stored locally contain sensitive production details. If the file is accessible, incident data leaks. | Medium — production details exposed | §14: Session data stored locally. No cloud transmission. User controls file location. Configurable retention. |
| **T7** | **Prompt injection via incident data** | Log entries or chat messages contain malicious instructions that cause the LLM to produce harmful output. | Medium — LLM hijacked via injected content | T1 mitigations apply. Human reviews all output before it's used. Commander can reject any draft. |

### 15.3 Trust boundaries

```
┌──────────────────────────────────────────────────────────────────┐
│  User's environment (trusted)                                     │
│                                                                   │
│  ┌──────────┐   ┌───────────┐   ┌─────────┐   ┌───────────────┐ │
│  │ Alert    │──▶│  Incident │──▶│  LLM    │──▶│ Pasteable     │ │
│  │ JSON     │   │ Commander │   │(local + │   │ Output        │ │
│  │ Logs     │   │  Agent    │   │ cloud)  │   │ (approved     │ │
│  │ Chat     │   │           │   │        │   │  by human)    │ │
│  │ GitHub   │   └───────────┘   └─────────┘   └───────────────┘ │
│  └──────────┘        │              │               │             │
│  ┌──────────┐        │              │               │             │
│  │Runbooks  │────────┘              │               │             │
│  │(local)   │                       │               │             │
│  └──────────┘                       │               │             │
│                              T2: local LLM          T1: interrupt  │
│                              default; user          before output  │
│                              opts in for cloud      T4: no exec    │
│                              T7: human reviews      capability     │
│                              all output                             │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
         T5: supply chain (pinned deps, pip-audit)
         T6: local session data (user-controlled, configurable retention)
```

---

## 16. Testing & validation strategy

### 16.1 Test layers

| Layer | Scope | What it validates | Location | CI? |
|---|---|---|---|---|
| **Unit** | Individual components: models, timeline engine, simulation, deploy correlation, cost tracker, evidence reranker | Each component works in isolation; edge cases | `tests/unit/` | Yes |
| **Integration** | Agent nodes with mocked tools; CLI commands; interrupt flows; cost tracking | Components work together; state transitions correct | `tests/integration/` | Yes |
| **E2E** | Full incident lifecycle on simulated alert; all interrupt points; cost report; LLM observability | The end-to-end user journey works with simulated data | `tests/e2e/` | Yes |
| **Field study** | Real agent on pre-built scenarios with real LLMs | AI-generated content quality, timeline accuracy, postmortem usefulness | `docs/field-study.md` | No (manual, pre-release) |

### 16.2 Test infrastructure

| Requirement | Detail |
|---|---|
| Mock LLM | Unit/integration tests use mock LLMs — no real API calls in CI |
| Mock retriever | All tests use a mock knowledge base — no real RAG queries in CI |
| Simulation mode testing | E2E tests run entirely in simulation mode with zero credentials |
| Cost tracking tests | Every E2E test verifies cost report is produced and per-node breakdown is correct |
| LLM observability tests | Every E2E test verifies LLM logs (prompt, response, tokens, latency) are recorded |
| Coverage | `pytest-cov`; enforce ≥80% via `--cov-fail-under=80` |
| CI matrix | Python 3.11/3.12 × ubuntu-latest |

### 16.3 Field study methodology

| Element | Detail |
|---|---|
| **Scope** | 5-8 pre-built incident scenarios with real LLMs (local + cloud) |
| **Scenario selection** | Diverse: SEV1 service outage, SEV2 degraded performance, SEV3 alert investigation, security incident, dependency failure, deploy-correlated incident, cascading failure, config rollback |
| **Metrics** | Timeline completeness, stakeholder update quality (consequence-first compliance), remediation suggestion relevance, postmortem drafting time, deploy correlation accuracy, cost per session, commander satisfaction (self-rated) |
| **Comparison** | AI-assisted vs manual: same scenarios, measure time and quality differences |
| **Documentation** | Results in `docs/field-study.md` with per-scenario table and aggregate summary |

### 16.4 Quality gates

| Gate | When | Criteria |
|---|---|---|
| **Pre-merge** | Every PR | CI green (unit + integration + e2e), coverage ≥80%, ruff clean, mypy strict clean |
| **Pre-release** | Before each version tag | Field study completed, pip-audit clean, all docs complete, CHANGELOG updated |
| **Pre-public** | Before flipping private → public | M1-M10 checklist complete (see `docs/wbs.md`), field study published, all quality gates met |

---

## 17. Documentation requirements

### 17.1 Documentation deliverables for v0.1.0

| # | Document | Audience | Location |
|---|---|---|---|
| D1 | **Quick start** | New users | `README.md` — install, simulate, see output in <5 min |
| D2 | **Architecture** | AI/agent developers | `docs/architecture.md` — state graph, nodes, edges, interrupts, data flow |
| D3 | **Safety guardrails** | All users | `docs/safety-guardrails.md` — confidence thresholds, citation requirements, draft-don't-post, no-exec policy, blameless COE framing |
| D4 | **LLM strategy** | All users | `docs/llm-strategy.md` — local + cloud LLM mix, cost tracking, escalation strategy, per-node observability |
| D5 | **Simulation guide** | New users + developers | `docs/simulation-guide.md` — how to create and run simulated incidents, pre-built scenario library |
| D6 | **Integration guide** | SRE/DevOps practitioners | `docs/integrations.md` — connecting real alert JSON, log files, GitHub exports, knowledge base |
| D7 | **Contributor guide** | OSS contributors | `CONTRIBUTING.md` — setup, tests, code standards, how to add nodes/tools/sources |
| D8 | **API reference** | All users | Inline docstrings + auto-generated reference |

### 17.2 Documentation quality bar

| Requirement | Target |
|---|---|
| Every code example in docs MUST be runnable | CI tests doc snippets |
| Every public API MUST have a docstring | `ruff` pydoclint check in CI |
| Quick start MUST work in <5 minutes | Validated by fresh-environment test before release |
| Architecture doc MUST include the state graph diagram | Visual or ASCII representation |
| Safety guardrails doc MUST be linked from README | Safety is a selling point, not a footnote |
| Pre-built scenario library MUST be documented | Each scenario: description, severity, expected behavior, key validation points |

---

## 18. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **LLM quality risk** — hallucinations during incidents produce wrong updates or suggestions | Medium | High | Human approval at every output; confidence threshold suppresses low-confidence suggestions; source citations required; dry-run shows expected outcome; blameless COE framing prevents blame-shifting |
| **Adoption risk** — teams skeptical of AI during incidents | Medium | High | Simulation mode lets teams evaluate without credentials or risk; pasteable output (no integration required); blog post series demonstrating value; field study data proving quality |
| **Scope creep** — requests for direct Slack/PagerDuty integration, web UI, multi-incident | High | Medium | Non-goals are explicit (NG1-NG7); explicit out-of-scope examples (§7.3); v0.2.0 roadmap for integration; maintain focus on v0.1.0 pasteable output model |
| **HolmesGPT mindshare** — 2.8k stars, established AI SRE tool | Medium | Medium | Different positioning: full lifecycle (not investigation only); simulation mode; human-in-the-loop; open source pip-installable; reference architecture for agent developers |
| **Cost transparency risk** — LLM costs during incidents are unpredictable | Medium | Medium | Per-session cost report; per-node token breakdown; local LLM as default (zero cost); configurable LLM routing (local for analysis, cloud for complex generation) |
| **Dependency on LLM ecosystem** — LangChain/LangGraph breaking changes | Low | Medium | Pin dependency versions; test against latest in CI weekly; SPEC documents the integration points |
| **Maintainer burnout** — single maintainer, ambitious scope | Medium | Medium | WBS is scoped to ~10 days; M1-M10 checklist for go-public; good first issues to attract contributors; clear non-goals to prevent scope creep |
| **Simulation fidelity** — simulation doesn't match real incident complexity | Medium | Medium | Pre-built scenario library covers diverse scenarios; field study validates with real LLMs; scenarios designed from real incident patterns |
| **Postmortem quality** — AI-generated COE draft is superficial or misses systemic factors | Medium | Medium | Blameless framing in prompt; systemic contributing factors section required; human reviews and edits; AI sections labeled for scrutiny; regeneration with different LLM supported |

---

## 19. Rollout & launch strategy

### 19.1 Pre-launch (private repo)

| Phase | Action | Gate |
|---|---|---|
| Build | Implement S1-S7 per WBS | All checkpoints pass |
| Quality | Field study (5-8 scenarios with real LLMs) | Field study published |
| Security scrub | M1: scan history for secrets, vault refs, local paths | gitleaks clean |
| Community prep | M2-M3: CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue/PR templates | All templates tested |
| CI/CD | M4: CI green, badges in README | CI passing on main |
| Good first issues | M7: 3-5 issues created | Issues are clear and self-contained |
| Internal issue cleanup | M8: delete all development tracking issues | Only community-facing issues remain |
| Final sweep | M9: full test suite, docs review, fresh install test | All green |

### 19.2 Launch sequence

| Step | Action | Timing |
|---|---|---|
| 1 | Flip repo: Private → Public | T=0 |
| 2 | Tag release: `git tag v0.1.0 && git push --tags` | T=0 |
| 3 | Post to GitHub (release notes, link to quickstart) | T=0 |
| 4 | Post to r/Python | T+1h |
| 5 | Post to r/devops | T+1h |
| 6 | Post to r/sre | T+1h |
| 7 | Post to LangGraph Discord / community | T+2h |
| 8 | Post to HN (Show HN) | T+4h |
| 9 | LinkedIn post with tagline + link | T+4h |
| 10 | Twitter/X post | T+4h |

### 19.3 Launch messaging

| Audience | Message |
|---|---|
| SRE/DevOps | "AI incident commander that drafts stakeholder updates, builds timelines, and generates blameless postmortems. `pip install ai-incident-commander` then `incident-commander simulate` — zero credentials, zero integration." |
| AI/agent developers | "Reference architecture for production-grade agentic workflows: state graph, human-in-the-loop interrupts, safety guardrails, multi-source data fusion. Full lifecycle incident response as a worked example." |
| Open source community | "MIT licensed, pip-installable, good first issues available. Built with LangGraph + LangChain. Simulation mode for zero-credential evaluation." |

### 19.4 Post-launch monitoring

| Period | Action |
|---|---|
| **First 48h** | Monitor GitHub issues, HN comments, Reddit responses. Respond to every comment within 4 hours. Fix critical bugs immediately. |
| **First week** | Triage all issues. Label and route. Write a weekly retrospective in GitHub Discussions. |
| **First 30 days** | Track adoption metrics (stars, downloads, issues, PRs). Identify top 3 requested features for v0.2.0. |
| **Day 30** | Evaluate v0.2.0 scope based on feedback. Prioritize: direct Slack/PagerDuty integration, daemon mode, multi-incident, audience-specific comms. |

---

## 20. Pricing & licensing stance

| Principle | Stance |
|---|---|
| **License** | MIT — always. No GPL, no copyleft, no dual-license. |
| **Price** | Free — always. No paid tier, no freemium, no enterprise edition. |
| **Hosting** | Self-hosted — always. No SaaS, no cloud deployment, no managed offering. |
| **Data** | User's data stays on the user's machine. No cloud transmission of session data. |
| **Commercial use** | Explicitly permitted. MIT license. Use it at work, use it in your SRE toolchain. |
| **Monetization** | None planned. This is an open-source project, not a commercial product. |
| **Future** | No plans to change this stance. If the project is ever commercialized, it would be a separate product (not this repo). |

---

## 21. Feedback & iteration loop

### 21.1 Feedback channels

| Channel | What we collect | How we use it | Cadence |
|---|---|---|---|
| GitHub Issues (bug) | Reproduction steps, version, Python version, scenario, severity | Triage → fix in next patch | Weekly |
| GitHub Issues (feature) | Use case, why current output doesn't cover it, proposed solution | Triage → in-scope (v0.2.0 backlog) or out-of-scope (redirect, §7.3) | Weekly |
| GitHub Discussions (Q&A) | Usage questions, "how do I configure X", integration questions | Answer publicly → feed common questions into FAQ/docs | Weekly |
| PyPI download stats | Install count, Python version distribution | Adoption signal | Monthly |
| GitHub stars / forks | Project visibility signal | Adoption signal | Monthly |
| Field study contributions | Users running scenarios and sharing results | Validate real-world value → publish as case studies | Ongoing |

### 21.2 Iteration cadence

| Period | Action |
|---|---|
| **Weekly** | Triage all new issues and discussions. Respond within 48 hours. Label and route. |
| **Monthly** | Review adoption metrics. Write a monthly retrospective in GitHub Discussions. Identify top 3 requested features. |
| **Per-release** | Close the feedback loop: publish release notes, comment on issues that informed the release. Update roadmap. |
| **Quarterly** | Review competitive landscape (§6). Check for new tools. Adjust positioning if needed. |

### 21.3 Feedback-to-roadmap pipeline

```
User reports issue / asks question
  → Triaged (weekly)
  → Categorized: bug | feature | docs | Q&A | out-of-scope
  → Bugs → immediate fix queue (next patch)
  → Features → v0.2.0 backlog (prioritized by: frequency × severity × alignment with goals §7.1)
  → Docs gaps → docs fix queue (next patch)
  → Q&A → answer + feed into FAQ if repeated
  → Out-of-scope → redirect (§7.3) + document in "rejected features" list (transparency)
```

### 21.4 Community feedback signals we watch for

| Signal | What it means | Action |
|---|---|---|
| Same question asked 3+ times | Documentation gap | Add to FAQ or improve docs |
| Same feature requested 3+ times | Real need not covered | Evaluate for v0.2.0 scope |
| External field study shared | Community validation | Publish as case study; link from README |
| Contributor submits PR for integration X | Demand for that integration | Review and merge if quality bar met |
| Issue with "workaround" in body | API gap users are hacking around | Evaluate making workaround first-class |

---

## 22. Exit & migration path

### 22.1 No lock-in

| Data type | Format | Location | Portable? |
|---|---|---|---|
| Session state | JSON | `~/.incident-commander/sessions/` | ✅ Exportable as JSON |
| Timeline | Markdown / JSON | Part of session | ✅ Pasteable anywhere |
| Stakeholder updates | Markdown blocks | Part of session | ✅ Pasteable anywhere |
| Postmortem | Markdown file | User-chosen location | ✅ Standard markdown |
| Cost reports | JSON + human-readable | Part of session | ✅ Exportable |
| LLM logs | JSONL | `~/.incident-commander/logs/` | ✅ Standard JSONL |

### 22.2 If the project is abandoned

| Concern | Answer |
|---|---|
| "Can I still use the tool?" | Yes — it's MIT licensed and self-hosted. No dependency on the maintainer or any server. |
| "Can I get my data out?" | Yes — all data is local JSON/JSONL/markdown. No proprietary format. |
| "Can I fork it?" | Yes — MIT license. Fork it, maintain it, adapt it. |
| "Will my sessions break?" | No — sessions are persisted as JSON. Future versions will support backward-compatible loading. |
| "Can I migrate to another tool?" | Yes — postmortems are markdown. Timelines are JSON. Updates are markdown blocks. All pasteable into any wiki, ticketing system, or chat tool. |

---

## 23. Release scope & roadmap

### 23.1 v0.1.0 — Initial public release

| Scope | In | Out |
|---|---|---|
| Simulation mode | Full lifecycle simulation with zero credentials, pre-built scenario library | — |
| Real data ingestion | Alert JSON, log files, chat export, GitHub JSON export | Direct Slack/PagerDuty/GitHub API integration (v0.2.0) |
| Output | Pasteable markdown blocks (incident notes + stakeholder comms) | Direct posting to Slack/PagerDuty (v0.2.0) |
| Timeline | Multi-source merge, trust hierarchy, deploy correlation, display | Real-time log streaming, metric correlation |
| Stakeholder updates | Consequence-first drafting, interrupt approval, severity-driven cadence | Multi-audience templates (v0.2.0), multi-channel posting |
| Remediation | Pattern matching with citations + confidence + dry-run simulation | Auto-execution (never — NG1), draft remediation PR (v0.2.0) |
| Postmortem | COE format, blameless framing, AI section labeling, session regeneration | Auto-publish, Confluence/Notion integration |
| Cost tracking | Per-session cost report, per-node token breakdown | Budget enforcement, cost alerts |
| LLM observability | Per-node LLM logging (prompt, response, tokens, latency) | Web dashboard, OTel integration (v0.2.0) |
| CLI | simulate, run, timeline, postmortem — foreground session | Web UI, daemon mode (v0.2.0), API server |
| Session persistence | Local persistence, resumable by thread ID | Cloud sync, Postgres checkpointer |
| Documentation | D1-D8 (all 8 documents) | — |
| LLM support | OMLX (local), Ollama, OpenAI, Anthropic | Other providers (v0.2.0) |

### 23.2 v0.2.0 — Post-launch iteration

| Scope | Rationale |
|---|---|
| Direct Slack integration (post updates, create channels) | Most requested integration from v0.1.0 feedback |
| Direct PagerDuty integration (fetch incidents, add notes) | Second most requested integration |
| Daemon mode (background monitoring, auto-start on alert) | Users want the tool to start automatically when an alert fires |
| Multi-incident support (concurrent sessions) | Teams with multiple simultaneous incidents |
| Audience-specific comms (exec summary vs engineering detail) | Stakeholders at different levels need different detail |
| Draft remediation PR on GitHub | Go beyond "suggest" to "draft the artifact" for commander review |
| Additional timeline sources | Datadog, Grafana, CloudWatch metric events |
| Community-driven features | Based on issue feedback from v0.1.0 |

### 23.3 Roadmap gates

```
v0.1.0 (public launch)
  │
  │  Gate: M1-M10 checklist complete (see docs/wbs.md)
  │  Gate: field study validated (5-8 scenarios)
  │  Gate: quality bar met (80% coverage, mypy strict, ruff clean)
  │  Gate: safety guardrails verified (all interrupts tested)
  │  Gate: cost tracking verified (per-session report in every E2E test)
  │  Gate: LLM observability verified (per-node logs in every E2E test)
  │
  ▼
v0.2.0 (post-launch iteration)
  │
  │  Gate: v0.1.0 shipped + 30 days of user feedback
  │  Gate: ≥3 external issues opened
  │
  ▼
v1.0.0 (stable release)
  │
  │  Gate: 10+ external PyPI users
  │  Gate: 1+ external contributor with merged PR
  │  Gate: 90 days in production without critical bugs
  │
  ▼
v1.x.y (stable, semver-compliant)
```

---

## 24. Packaging & distribution

| Channel | Detail |
|---|---|
| PyPI | `pip install ai-incident-commander` (core + CLI) |
| Optional extras | `ai-incident-commander[rag]` (vector store client for real RAG mode) |
| Python package | Standard `pyproject.toml` (hatchling) |
| License | MIT |

### 24.1 Naming & branding

| Element | Value |
|---|---|
| **Package name (PyPI)** | `ai-incident-commander` |
| **Import name** | `incident_commander` |
| **CLI command** | `incident-commander` |
| **GitHub repo** | `ai-incident-commander` |
| **Tagline** | "AI incident commander for war rooms, timelines, and postmortems." |
| **Short description** | "Builds live timelines, drafts stakeholder updates, suggests remediations, and generates blameless postmortems. Simulation mode works with zero credentials." |

---

## 25. Community & governance

### 25.1 Governance model

ai-incident-commander is **maintainer-managed**. The project owner (Debashish Ghosal) reviews and merges all PRs, makes architectural decisions, and triages issues. Formal governance will be defined as the community grows.

### 25.2 Community channels

| Channel | Purpose |
|---|---|
| GitHub Issues | Bug reports, feature requests, integration questions |
| GitHub Discussions | Q&A, simulation scenario sharing, architecture discussions |
| Pull Requests | Code contributions, documentation improvements |

### 25.3 Contribution path

```
User opens issue → Maintainer triages →
  Bug? → Label "bug" → Contributor picks up → PR → Review → Merge
  Feature? → Label "enhancement" → Maintainer evaluates scope →
    In scope? → Contributor picks up → PR → Review → Merge
    Out of scope? → Redirect (see §7.3)
  Good first issue? → Label "good first issue" → New contributor picks up → PR → Review → Merge
```

### 25.4 Governance evolution triggers

| Trigger | Action |
|---|---|
| 5+ regular contributors | Define contributor ladder (contributor → reviewer → maintainer) |
| 1+ co-maintainer | Document decision-making process (RFC process for breaking changes) |
| 100+ GitHub stars | Consider a steering committee or working group |

---

## 26. Open questions

| # | Question | Status | Resolution |
|---|---|---|---|
| OQ-1 | Should v0.1.0 support custom postmortem templates (Google, Amazon, custom) in addition to COE? | Open | Default to COE for v0.1.0; configurable templates in v0.2.0 |
| OQ-2 | Should the tool support multiple concurrent incidents (multiple sessions)? | Resolved | v0.1.0: single incident per session. v0.2.0: multi-incident. |
| OQ-3 | Should stakeholder updates support multiple audiences (exec summary vs engineering detail)? | Resolved | v0.1.0: single audience. v0.2.0: audience-specific templates. |
| OQ-4 | Should the tool integrate with incident.io as a source? | Open | v0.1.0: alert JSON only. v0.2.0: incident.io support. |
| OQ-5 | Should the postmortem include a "lessons learned" section generated by the LLM? | Open | v0.1.0: action items + systemic contributing factors. "Lessons learned" is human-written — too subjective for AI. |
| OQ-6 | What is the default LLM routing strategy? (local for analysis, cloud for comms? or all local?) | Open | SPEC phase — document in `docs/llm-strategy.md` |
| OQ-7 | Should the pre-built scenario library be extensible (users add their own scenarios)? | Open | v0.1.0: fixed library. v0.2.0: user-defined scenarios via config. |
| OQ-8 | Should the tool support exporting the timeline as a structured format (CSV, JSON) for import into other tools? | Open | v0.1.0: markdown display + JSON session export. CSV export in v0.2.0. |

---

## 27. References

| Reference | Relevance |
|---|---|
| [HolmesGPT](https://github.com/robusta-dev/holmesgpt) | AI SRE investigation agent — competitive analysis, feature ideas (remediation PRs) |
| [sre-warroom](https://github.com/AiJoseph/sre-warroom) | 5-agent LangGraph pipeline — competitive analysis, agent design patterns |
| [sre-copilot](https://github.com/AiJoseph/sre-copilot) | Chat-based SRE assistant — competitive analysis |
| PagerDuty Copilot (Scribe, Insights) | Commercial AI incident assistant — competitive analysis, audience-specific comms |
| ilert AI | Commercial AI postmortems — competitive analysis, pattern identification |
| Amazon COE (Correction of Errors) | Postmortem format — blameless, systemic, action-oriented |
| [Keep a Changelog](https://keepachangelog.com/) | Changelog format standard |
| [Semantic Versioning](https://semver.org/) | Versioning standard. Applied post-1.0.0; 0.x.y has relaxed rules. |
| [Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) | Code of conduct standard for open-source projects |
| Project description | `docs/PRD.md` (this document) |

---

## 28. Sign-off

| Role | Name | Date | Status |
|---|---|---|---|
| Product owner | Debashish Ghosal | 2026-07-12 | **Approved** ✅ |
