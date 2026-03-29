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

### Roster — Provisioned in BrainstormRouter

All agents are registered in BR production with real budgets and enforcement.
Provisioned: 2026-03-29. Script: `brainstormrouter/scripts/provision-living-case-study.ts`

| Agent | BR agent_id | Role | Daily Budget | Monthly Budget | Cost Center | Primary Model |
|-------|-------------|------|-------------|----------------|-------------|---------------|
| Alex | `alex-crypto` | Crypto Engineer | $3.00 | $60.00 | security-eng | Opus 4.6 |
| Casey | `casey-apisec` | API Security Lead | $4.00 | $80.00 | security-eng | Sonnet 4.6 |
| Sam | `sam-compliance` | Compliance Officer | $2.00 | $40.00 | compliance | Opus 4.6 |
| Morgan | `morgan-devops` | DevOps Engineer | $3.00 | $60.00 | platform | Sonnet 4.6 |
| River | `river-risk` | Risk Analyst | $2.50 | $50.00 | security-eng | Gemini 3.1 Pro |
| Jordan | `jordan-auth` | Auth Architect | $3.50 | $70.00 | security-eng | Opus 4.6 |
| Taylor | `taylor-qa` | QA Engineer | $3.00 | $60.00 | quality | Sonnet 4.6 |
| Sage | `sage-pm` | Product Manager | $2.00 | $40.00 | product | GPT-5.4 |
| Quinn | `quinn-architect` | Architect | $5.00 | $100.00 | architecture | Opus 4.6 |
| Avery | `avery-frontend` | Frontend Engineer | $3.00 | $60.00 | frontend | Sonnet 4.6 |

**Total: $31.00/day, $620.00/month. Enforcement: hard.**

Quinn has `can_delegate: true` — can spawn sub-agents with sliced budgets.

## BrainstormRouter Integration

**API:** `https://api.brainstormrouter.com/v1`
**Auth:** Admin API key stored in 1Password (`BR Living Case Study Key`) or `.env.case-study`
**Providers:** Anthropic, OpenAI, Google (all registered and active)

### How agents make calls

1. Bootstrap agent to get JWT: `POST /v1/agent/bootstrap` with admin key + `{"agent_id": "quinn-architect"}`
2. Use JWT for completions: `POST /v1/chat/completions` with `Authorization: Bearer <jwt>`
3. Every call returns BR headers — agents reference these in check-ins:
   - `x-br-actual-cost` — what this call cost
   - `x-br-budget-remaining` — how much budget is left
   - `x-br-route-reason` — why this model was chosen
   - `x-br-quality-score` — quality assessment
   - `x-br-reputation-tier` — agent's reputation (gold, silver, etc.)
   - `x-br-agent-cost-center` — cost attribution
   - `x-br-audit-hash` — evidence chain hash

### Agent budget awareness

Agents can check their own status: `GET /v1/agent/status` (with JWT auth)
Returns: profile, budget limits, spend, remaining, anomaly events, governance state.

Cost data tracked per agent, per feature, per sprint in `progress/costs.json`.

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
