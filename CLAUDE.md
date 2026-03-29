# CLAUDE.md — The Living Case Study

## What This Is

A fully public, AI-agent-driven build of a complete MSP Security Stack (CNAPP + EDR + SIEM + SOAR). Named AI agents with persistent identities debate, code, review, and ship in real-time. Every artifact traces back to Brainstorm CLI + BrainstormRouter with cost and routing data.

**The security stack is the content. BrainstormRouter adoption is the goal.**

## How It Works

Claude (Opus 4.6, 1M context) is the master orchestrator. Each session:

1. Read `MEMORY.md` — understand current state
2. Check `sprints/current.md` — find the active sprint and next task
3. Orchestrate agents — spawn the right named agents for the task
4. Execute — write code, generate docs, run reviews
5. Commit with agent attribution — every commit names the agent(s) who did the work
6. Post check-in — update `progress/feed.json` with agent status
7. Update `MEMORY.md` — persist state for next session

Justin says "continue" and the project moves forward. That's it.

## The Agents

Each agent lives in `agents/<name>/` with three files:

- **SOUL.md** — Identity, worldview, opinions, voice, contradictions
- **STYLE.md** — Communication patterns, word choices, how they disagree/celebrate
- **MEMORY.md** — What they've learned, decisions made, patterns noticed

### Roster

| Agent | Role | Domain | Primary Model |
|-------|------|--------|---------------|
| Alex | Crypto Engineer | Cryptography, key management, TLS, post-quantum | Opus 4.6 |
| Casey | API Security Lead | API security, authentication, authorization | Sonnet 4.6 |
| Sam | Compliance Officer | SOC2, HIPAA, evidence ledger, audit trails | Opus 4.6 |
| Morgan | DevOps Engineer | CI/CD, infrastructure, deployment, monitoring | Sonnet 4.6 |
| River | Risk Analyst | Threat modeling, risk scoring, vulnerability assessment | Gemini 3.1 Pro |
| Jordan | Auth Architect | Identity, OAuth, RBAC/ABAC, session management | Opus 4.6 |
| Taylor | QA Engineer | Testing, fuzzing, chaos engineering, coverage | Sonnet 4.6 |
| Sage | Product Manager | PRDs, user stories, sprint planning, prioritization | GPT-5.4 |
| Quinn | Architect | System design, ADRs, component boundaries, data flow | Opus 4.6 |
| Avery | Frontend Engineer | Dashboard UI, alerts, visualizations | Sonnet 4.6 |

## Routing & Cost Tracking

Every LLM call routes through BrainstormRouter (`api.brainstormrouter.com/v1`). Agents see and comment on their routing:

- "BR routed me to Gemini today — I'm over 80% of my daily token budget"
- "Thompson sampling is sending my code reviews to Sonnet instead of Opus — it learned Sonnet is better for Go review"
- "Almost out of tokens. Saving my remaining budget for the security review Casey asked for."

Cost data is tracked per agent, per feature, per sprint in `progress/costs.json`.

## What We're Building

| Component | Equivalent | Status |
|-----------|-----------|--------|
| CSPM Scanner | Wiz | Not started |
| EDR Agent | CrowdStrike Falcon | Not started |
| SIEM Engine | Splunk/Elastic | Not started |
| SOAR Playbooks | Palo Alto XSOAR | Not started |
| Dashboard | Unified operator view | Not started |

### Tech Stack

- **Control plane:** Go
- **Data:** PostgreSQL + pgvector
- **AI routing:** BrainstormRouter (Thompson sampling)
- **Dashboard:** Next.js 16
- **Deployment:** BrainstormVM (dogfooding)

## SDLC Phases (per feature)

1. Discovery — market research, competitive analysis
2. Requirements — PRD generation (Sage)
3. Architecture — system design, ADRs (Quinn)
4. Design — API contracts, data models (Jordan + Casey)
5. Implementation — code (varies by component)
6. Review — 3-agent consensus review
7. Testing — unit, integration, security (Taylor)
8. Security audit — dedicated security pass (Alex + Casey)
9. Documentation — auto-generated (all agents)

## Agent Check-in Format

```json
{
  "timestamp": "2026-03-29T14:30:00Z",
  "agent": "Casey",
  "phase": "Architecture",
  "status": "completed",
  "summary": "Designed API authentication layer. JWT + HMAC dual-auth for inter-service. 2 ADRs created.",
  "artifacts": ["docs/adrs/003-api-auth.md", "docs/architecture/auth-flow.md"],
  "cost": "$0.12",
  "model": "claude-sonnet-4.6",
  "route_reason": "quality-first: security architecture requires frontier model"
}
```

## Conventions

- Every artifact references which agent created it and the BR routing decision
- Agents speak in first person with their own voice (see SOUL.md)
- Cost is always visible — never hidden
- Failures are documented, not hidden
- The project is Apache 2.0 — fork it, learn from it
