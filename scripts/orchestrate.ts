#!/usr/bin/env npx tsx
/**
 * Living Case Study — Orchestration Engine
 *
 * The orchestrator decides WHO acts next based on the sprint plan,
 * gathers relevant context from prior agents' artifacts, calls BR
 * with the agent's JWT, writes the artifact + feed check-in, and commits.
 *
 * Pattern: MiroFish (centralized orchestrator, shared platform state)
 *        + OpenClaw (files as state machines, SOUL.md identity)
 *
 * The repo IS the shared platform. Agents communicate by producing
 * artifacts that reference each other's work.
 *
 * Usage:
 *   BR_ADMIN_KEY=... npx tsx scripts/orchestrate.ts [task_number]
 *   BR_ADMIN_KEY=... npx tsx scripts/orchestrate.ts next
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = resolve(process.cwd());
const API_URL = process.env.BR_API_URL ?? "https://api.brainstormrouter.com";
const ADMIN_KEY = process.env.BR_ADMIN_KEY;

if (!ADMIN_KEY) {
  console.error("Set BR_ADMIN_KEY env var");
  process.exit(1);
}

// ── Agent Registry ──────────────────────────────────────────────────

type AgentConfig = {
  id: string;
  displayName: string;
  role: string;
  model: string;
  soulPath: string;
};

const AGENTS: Record<string, AgentConfig> = {
  "quinn-architect":  { id: "quinn-architect",  displayName: "Quinn",  role: "Architect",        model: "anthropic/claude-opus-4-6",   soulPath: "agents/quinn/SOUL.md" },
  "sage-pm":          { id: "sage-pm",          displayName: "Sage",   role: "Product Manager",  model: "openai/gpt-4.1",              soulPath: "agents/sage/SOUL.md" },
  "casey-apisec":     { id: "casey-apisec",     displayName: "Casey",  role: "API Security",     model: "anthropic/claude-sonnet-4-6", soulPath: "agents/casey/SOUL.md" },
  "alex-crypto":      { id: "alex-crypto",      displayName: "Alex",   role: "Crypto Engineer",  model: "anthropic/claude-sonnet-4-6", soulPath: "agents/alex/SOUL.md" },
  "jordan-auth":      { id: "jordan-auth",      displayName: "Jordan", role: "Auth Architect",   model: "anthropic/claude-opus-4-6",   soulPath: "agents/jordan/SOUL.md" },
  "river-risk":       { id: "river-risk",       displayName: "River",  role: "Risk Analyst",     model: "google/gemini-2.5-flash",     soulPath: "agents/river/SOUL.md" },
  "sam-compliance":   { id: "sam-compliance",    displayName: "Sam",    role: "Compliance",       model: "anthropic/claude-sonnet-4-6", soulPath: "agents/sam/SOUL.md" },
  "morgan-devops":    { id: "morgan-devops",     displayName: "Morgan", role: "DevOps",           model: "anthropic/claude-sonnet-4-6", soulPath: "agents/morgan/SOUL.md" },
  "taylor-qa":        { id: "taylor-qa",         displayName: "Taylor", role: "QA Engineer",      model: "anthropic/claude-sonnet-4-6", soulPath: "agents/taylor/SOUL.md" },
  "avery-frontend":   { id: "avery-frontend",    displayName: "Avery",  role: "Frontend",         model: "anthropic/claude-sonnet-4-6", soulPath: "agents/avery/SOUL.md" },
};

// ── Sprint Task Definitions ─────────────────────────────────────────

type SprintTask = {
  number: number;
  title: string;
  agentId: string;
  outputPath: string;
  contextPaths: string[];
  respondsTo: string[];
  prompt: string;
  maxTokens: number;
};

const SPRINT_1_TASKS: SprintTask[] = [
  {
    number: 1,
    title: "CSPM competitive analysis + PRD",
    agentId: "sage-pm",
    outputPath: "docs/prds/cspm-v1.md",
    contextPaths: [],
    respondsTo: [],
    prompt: `You are writing the first PRD for the Living Case Study — a CSPM (Cloud Security Posture Management) scanner, equivalent to what Wiz does.

Write a production-quality PRD with:
1. Executive summary (what we're building and why)
2. Competitive landscape (Wiz, Orca Security, Prisma Cloud — what they do, where we differentiate)
3. User personas (MSP operators, security engineers, compliance officers)
4. Core features for v1 (misconfiguration detection, compliance mapping, auto-remediation recommendations)
5. Acceptance criteria (specific, testable)
6. Non-goals (what we're NOT building in v1)
7. Technical constraints (must integrate with BrainstormMSP, must use Go control plane, PostgreSQL + pgvector)
8. Success metrics

Keep it under 2000 words. Be specific — name exact AWS/Azure/GCP services, exact compliance frameworks (CIS Benchmarks, SOC2 CC6/CC7, HIPAA 164.312). This PRD will be reviewed by Quinn (Architect), Casey (API Security), and Sam (Compliance) next.`,
    maxTokens: 4000,
  },
  {
    number: 2,
    title: "System architecture + ADR-001",
    agentId: "quinn-architect",
    outputPath: "docs/architecture/system-design-v1.md",
    contextPaths: ["docs/prds/cspm-v1.md"],
    respondsTo: ["sage-pm"],
    prompt: `Sage just wrote the CSPM PRD. Read it carefully — your job is to design the system architecture.

Write:
1. ADR-001: Monolith vs Microservices decision (with trade-offs, your recommendation, and why)
2. High-level system architecture (ASCII diagram)
3. Component breakdown: Scanner Engine, Policy Engine, Remediation Engine, Data Store, API Layer
4. Data flow: cloud provider → scanner → policy evaluation → findings → dashboard
5. Integration points with BrainstormMSP (the existing platform)
6. Technology choices with rationale (Go, PostgreSQL + pgvector, gRPC vs REST)

Reference specific parts of Sage's PRD. If you disagree with any technical constraints or scope decisions, say so explicitly — this is a public project and honest disagreements make it real.`,
    maxTokens: 4000,
  },
  {
    number: 3,
    title: "Authentication & authorization design + ADR-002",
    agentId: "jordan-auth",
    outputPath: "docs/architecture/auth-design-v1.md",
    contextPaths: ["docs/prds/cspm-v1.md", "docs/architecture/system-design-v1.md"],
    respondsTo: ["sage-pm", "quinn-architect"],
    prompt: `Sage wrote the PRD and Quinn designed the system architecture. Read both carefully.

Write ADR-002: Authentication & Authorization Design:
1. Multi-tenant isolation model (how MSP operators manage multiple client environments)
2. Authentication: JWT structure, token lifetimes, rotation strategy
3. Authorization: RBAC vs ABAC decision, role hierarchy, permission matrix
4. API authentication for cloud provider integrations (AWS AssumeRole, Azure Service Principal, GCP Service Account)
5. Session management for the dashboard
6. Inter-service authentication (between Scanner, Policy, and Remediation engines)

Reference Quinn's architecture and Sage's personas. If Quinn's component boundaries create auth challenges, flag them. If Sage's user personas need different permission levels than what the architecture supports, flag that too.`,
    maxTokens: 4000,
  },
  {
    number: 4,
    title: "CSPM threat model (STRIDE)",
    agentId: "river-risk",
    outputPath: "docs/security/threat-model-v1.md",
    contextPaths: ["docs/prds/cspm-v1.md", "docs/architecture/system-design-v1.md", "docs/architecture/auth-design-v1.md"],
    respondsTo: ["sage-pm", "quinn-architect", "jordan-auth"],
    prompt: `Sage wrote the PRD, Quinn designed the architecture, and Jordan designed the auth layer. Read all three.

Write the initial threat model using STRIDE:
1. System boundary diagram (what's in scope)
2. STRIDE analysis per component (Scanner Engine, Policy Engine, API Layer, Data Store)
3. Attack tree for the highest-risk path (cloud credential compromise)
4. Risk scoring: likelihood x impact matrix
5. Mitigations: what Jordan's auth design already covers, what's still exposed
6. Top 5 risks ranked by severity with specific mitigation recommendations

Be quantitative. Use CVSS-style scoring where applicable. Reference specific components from Quinn's architecture and specific auth flows from Jordan's design. If you find gaps in their designs, flag them explicitly as findings — that's your job.`,
    maxTokens: 4000,
  },
  {
    number: 5,
    title: "API security requirements",
    agentId: "casey-apisec",
    outputPath: "docs/security/api-security-requirements-v1.md",
    contextPaths: ["docs/prds/cspm-v1.md", "docs/architecture/system-design-v1.md", "docs/architecture/auth-design-v1.md", "docs/security/threat-model-v1.md"],
    respondsTo: ["quinn-architect", "jordan-auth", "river-risk"],
    prompt: `Quinn designed the architecture, Jordan designed auth, and River produced the threat model. Read all of them.

Write the API security requirements:
1. Input validation rules per endpoint category (scan triggers, policy CRUD, findings queries)
2. Rate limiting strategy (per-tenant, per-endpoint, burst handling)
3. Error response standards (what to expose vs what to hide)
4. API versioning strategy
5. Webhook security (HMAC signing, replay protection)
6. CORS and CSP policy
7. Specific responses to River's threat model findings — how does the API layer mitigate each identified risk?

Reference River's risk scores. If the threat model missed API-specific risks, add them. If Jordan's auth design has gaps at the API layer, flag them with the specific curl command that would demonstrate the vulnerability.`,
    maxTokens: 4000,
  },
  {
    number: 6,
    title: "Cryptographic requirements",
    agentId: "alex-crypto",
    outputPath: "docs/security/crypto-requirements-v1.md",
    contextPaths: ["docs/architecture/system-design-v1.md", "docs/architecture/auth-design-v1.md", "docs/security/threat-model-v1.md"],
    respondsTo: ["quinn-architect", "jordan-auth", "river-risk"],
    prompt: `Quinn designed the architecture, Jordan designed auth, and River identified threats. Read all three.

Write the cryptographic requirements:
1. Key management architecture (hierarchy: root key, tenant keys, session keys)
2. TLS configuration (minimum version, cipher suites, certificate management)
3. Data encryption at rest (what gets encrypted, what doesn't, and why)
4. Secrets management (cloud provider credentials, API keys, JWT signing keys)
5. Post-quantum readiness assessment (what needs to change when NIST standards finalize)
6. Certificate lifecycle (issuance, rotation, revocation for inter-service mTLS)

Reference Jordan's JWT design — if the signing algorithm or key rotation is wrong, say so. Reference River's attack tree — which crypto measures directly mitigate the identified threats? Be specific about algorithms, key sizes, and rotation intervals.`,
    maxTokens: 4000,
  },
];

// ── BR API Helpers ──────────────────────────────────────────────────

async function getAgentJwt(agentId: string): Promise<string> {
  const res = await fetch(`${API_URL}/v1/agent/bootstrap`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ADMIN_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: agentId }),
  });
  const data = (await res.json()) as { jwt?: string };
  if (!data.jwt) throw new Error(`No JWT for ${agentId}: ${JSON.stringify(data)}`);
  return data.jwt;
}

// Model fallback chains — if primary is down, try alternatives
const FALLBACK_CHAINS: Record<string, string[]> = {
  "anthropic/claude-opus-4-6":   ["anthropic/claude-sonnet-4-6", "openai/gpt-4.1", "google/gemini-2.5-pro"],
  "anthropic/claude-sonnet-4-6": ["openai/gpt-4.1", "google/gemini-2.5-pro", "google/gemini-2.5-flash"],
  "openai/gpt-4.1":             ["anthropic/claude-sonnet-4-6", "google/gemini-2.5-pro"],
  "google/gemini-2.5-pro":      ["anthropic/claude-sonnet-4-6", "openai/gpt-4.1"],
  "google/gemini-2.5-flash":    ["openai/gpt-4.1", "anthropic/claude-sonnet-4-6"],
};

async function callBR(
  jwt: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<{ text: string; model: string; cost: number; headers: Record<string, string>; fallback: boolean }> {
  const modelsToTry = [model, ...(FALLBACK_CHAINS[model] ?? [])];

  for (let i = 0; i < modelsToTry.length; i++) {
    const currentModel = modelsToTry[i];
    const isFallback = i > 0;

    if (isFallback) {
      console.log(`  Fallback: trying ${currentModel} (${model} unavailable)...`);
    }

    try {
      const res = await fetch(`${API_URL}/v1/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: currentModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: maxTokens,
          temperature: 0.4,
        }),
      });

      const brHeaders: Record<string, string> = {};
      for (const [k, v] of res.headers.entries()) {
        if (k.startsWith("x-br-")) brHeaders[k] = v;
      }

      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        model?: string;
        error?: { message?: string; type?: string };
      };

      // If model unavailable, try next in chain
      if (body.error?.type === "model_unavailable") {
        console.log(`  ${currentModel}: unavailable (${body.error.message?.slice(0, 60)}...)`);
        if (i < modelsToTry.length - 1) continue;
        throw new Error(`All models exhausted. Last error: ${body.error.message}`);
      }

      if (!body.choices?.[0]?.message?.content) {
        if (i < modelsToTry.length - 1) continue;
        throw new Error(`Empty response from ${currentModel}: ${JSON.stringify(body).slice(0, 200)}`);
      }

      if (isFallback) {
        console.log(`  Fallback succeeded: ${currentModel} (originally requested ${model})`);
      }

      return {
        text: body.choices[0].message.content,
        model: body.model ?? currentModel,
        cost: parseFloat(brHeaders["x-br-actual-cost"] ?? "0"),
        headers: brHeaders,
        fallback: isFallback,
      };
    } catch (err) {
      if (err instanceof TypeError && err.message.includes("fetch")) {
        // Network error — retry next model
        if (i < modelsToTry.length - 1) continue;
      }
      throw err;
    }
  }

  throw new Error(`All ${modelsToTry.length} models failed for request`);
}

// ── Context Gathering ───────────────────────────────────────────────

function gatherContext(task: SprintTask): string {
  const sections: string[] = [];

  for (const ctxPath of task.contextPaths) {
    const fullPath = join(ROOT, ctxPath);
    if (existsSync(fullPath)) {
      const content = readFileSync(fullPath, "utf-8");
      const sourceTask = SPRINT_1_TASKS.find(t => t.outputPath === ctxPath);
      const agentName = sourceTask ? AGENTS[sourceTask.agentId]?.displayName ?? "Unknown" : "Unknown";
      sections.push(`--- ARTIFACT: ${ctxPath} (by ${agentName}) ---\n\n${content}\n`);
    }
  }

  if (sections.length === 0) return "";
  return `\n\n## Context from other agents\n\nThe following artifacts were produced by other agents on this project. Read them carefully and reference them in your response.\n\n${sections.join("\n")}`;
}

function loadSoul(agent: AgentConfig): string {
  const soulPath = join(ROOT, agent.soulPath);
  return existsSync(soulPath)
    ? readFileSync(soulPath, "utf-8")
    : `You are ${agent.displayName}, ${agent.role} on the Living Case Study team.`;
}

// ── Feed + Git ──────────────────────────────────────────────────────

function appendFeedEntry(entry: Record<string, unknown>) {
  const feedPath = join(ROOT, "progress", "feed.json");
  const feed = JSON.parse(readFileSync(feedPath, "utf-8"));
  feed.checkins.push(entry);
  writeFileSync(feedPath, JSON.stringify(feed, null, 2) + "\n");
}

function gitCommitAndPush(message: string, files: string[]) {
  for (const f of files) {
    execFileSync("git", ["add", f], { cwd: ROOT, stdio: "pipe" });
  }
  const fullMsg = `${message}\n\nCo-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`;
  execFileSync("git", ["commit", "-m", fullMsg], { cwd: ROOT, stdio: "pipe" });
  execFileSync("git", ["push", "origin", "main"], { cwd: ROOT, stdio: "pipe" });

  // Trigger real-time revalidation of brainstorm.co/live
  revalidateLivePage();
}

async function revalidateLivePage() {
  const secret = process.env.REVALIDATION_SECRET;
  if (!secret) return;
  try {
    const res = await fetch("https://brainstorm.co/api/revalidate", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (res.ok) {
      console.log("  brainstorm.co/live revalidated.");
    } else {
      console.log(`  Revalidation failed: ${res.status}`);
    }
  } catch {
    console.log("  Revalidation request failed (non-blocking).");
  }
}

// ── Sprint State ────────────────────────────────────────────────────

function getCompletedTasks(): number[] {
  return SPRINT_1_TASKS.filter(t => existsSync(join(ROOT, t.outputPath))).map(t => t.number);
}

function getNextTask(): SprintTask | null {
  const completed = new Set(getCompletedTasks());
  return SPRINT_1_TASKS.find(t => !completed.has(t.number)) ?? null;
}

// ── Execute ─────────────────────────────────────────────────────────

async function executeTask(task: SprintTask) {
  const agent = AGENTS[task.agentId];
  if (!agent) throw new Error(`Unknown agent: ${task.agentId}`);

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  Task ${task.number}: ${task.title}`);
  console.log(`  Agent: ${agent.displayName} (${agent.id})`);
  console.log(`  Model: ${agent.model}`);
  console.log(`  Output: ${task.outputPath}`);
  console.log(`  Context: ${task.contextPaths.length} artifacts`);
  console.log(`  Responds to: ${task.respondsTo.join(", ") || "none"}`);
  console.log(`${"═".repeat(60)}\n`);

  const soul = loadSoul(agent);
  const context = gatherContext(task);

  const systemPrompt = [
    soul,
    "",
    "## Project Context",
    "",
    "You are working on the Living Case Study — a fully public project where 10 AI agents build a complete MSP Security Stack (CNAPP + EDR + SIEM + SOAR) from scratch.",
    "This is Sprint 1: Discovery + Architecture. Every artifact you produce is public and will be reviewed by other agents.",
    "Your output will be committed to the GitHub repo and displayed on brainstorm.co/live.",
    "Every LLM call (including this one) routes through BrainstormRouter with real cost tracking.",
    "",
    "Write as yourself — use first person, reference your domain expertise, show your personality from your SOUL.md.",
    "If you reference another agent's work, name them explicitly (e.g., 'Quinn's architecture proposes...').",
    "If you disagree with another agent, say so directly with your reasoning.",
    context,
  ].join("\n");

  console.log("  Getting JWT...");
  const jwt = await getAgentJwt(agent.id);

  console.log(`  Calling BR (${agent.model})...`);
  const startMs = Date.now();
  const result = await callBR(jwt, agent.model, systemPrompt, task.prompt, task.maxTokens);
  const elapsedMs = Date.now() - startMs;

  console.log(`  Response: ${result.text.length} chars, ${result.model}, $${result.cost.toFixed(4)}, ${elapsedMs}ms`);

  // Write artifact with BR metadata header
  const outputDir = join(ROOT, task.outputPath.split("/").slice(0, -1).join("/"));
  mkdirSync(outputDir, { recursive: true });

  const header = [
    `<!-- Agent: ${agent.id} | Model: ${result.model} | Cost: $${result.cost.toFixed(4)} | Latency: ${elapsedMs}ms -->`,
    `<!-- Route: ${result.headers["x-br-route-reason"] ?? "?"} | Quality: ${result.headers["x-br-quality-score"] ?? "?"} | Reputation: ${result.headers["x-br-reputation-tier"] ?? "?"} -->`,
    `<!-- Budget remaining: $${result.headers["x-br-budget-remaining"] ?? "?"} -->`,
    "",
  ].join("\n");

  writeFileSync(join(ROOT, task.outputPath), header + result.text + "\n");
  console.log(`  Wrote: ${task.outputPath}`);

  // Feed entry
  appendFeedEntry({
    timestamp: new Date().toISOString(),
    agent: agent.id,
    phase: `Sprint 1 / Task ${task.number}`,
    status: "completed",
    summary: `Completed: ${task.title}. Output: ${task.outputPath}`,
    responds_to: task.respondsTo.length > 0 ? task.respondsTo : undefined,
    artifact: task.outputPath,
    cost: `$${result.cost.toFixed(4)}`,
    model: result.model,
    route_reason: result.headers["x-br-route-reason"] ?? "unknown",
    quality_score: result.headers["x-br-quality-score"] ?? "n/a",
    reputation_tier: result.headers["x-br-reputation-tier"] ?? "n/a",
    latency_ms: elapsedMs,
    budget_remaining: result.headers["x-br-budget-remaining"]
      ? parseFloat(result.headers["x-br-budget-remaining"])
      : null,
  });
  console.log("  Feed entry appended.");

  gitCommitAndPush(`feat(${agent.id}): ${task.title}`, [task.outputPath, "progress/feed.json"]);
  console.log(`  Committed + pushed.`);

  return result;
}

// ── Sprint Advancement ──────────────────────────────────────────────

async function advanceSprint(): Promise<SprintTask | null> {
  console.log("\n  Sprint 1 complete. Generating Sprint 2 via Sage (PM)...\n");

  // Gather all Sprint 1 artifacts as context for sprint planning
  const allArtifacts = SPRINT_1_TASKS
    .map(t => {
      const p = join(ROOT, t.outputPath);
      if (!existsSync(p)) return "";
      const content = readFileSync(p, "utf-8");
      const agent = AGENTS[t.agentId];
      return `--- ${t.outputPath} (by ${agent?.displayName}) ---\n${content.slice(0, 2000)}\n[truncated]\n`;
    })
    .filter(Boolean)
    .join("\n");

  const jwt = await getAgentJwt("sage-pm");
  const result = await callBR(
    jwt,
    "openai/gpt-4.1",
    `You are Sage, the Product Manager for the Living Case Study. Sprint 1 (Discovery + Architecture) is complete. You need to define Sprint 2.

You have 10 agents: Quinn (Architect), Casey (API Security), Alex (Crypto), Jordan (Auth), River (Risk), Sam (Compliance), Morgan (DevOps), Taylor (QA), Avery (Frontend), and yourself (PM).

Sprint 1 produced: a CSPM PRD, system architecture, auth design, threat model, API security requirements, and crypto requirements.

Sprint 2 should be: Implementation. The team starts building code based on the architecture and security designs from Sprint 1.`,
    `Based on the Sprint 1 artifacts below, define Sprint 2 tasks. Output ONLY valid JSON — an array of task objects with these fields:
- number (integer starting at 7)
- title (string)
- agentId (string — must be one of: quinn-architect, casey-apisec, alex-crypto, jordan-auth, river-risk, sam-compliance, morgan-devops, taylor-qa, sage-pm, avery-frontend)
- outputPath (string — path like "src/scanner/main.go" or "docs/reviews/arch-review.md")
- contextPaths (string array — Sprint 1 artifacts this task should read)
- respondsTo (string array — agent IDs whose work this task builds on)
- prompt (string — detailed task prompt for the agent)
- maxTokens (integer — typically 4000)

Define 6-8 tasks that advance the project from architecture to working code. Each task should build on prior agents' work. Output ONLY the JSON array, no markdown fences, no explanation.

Sprint 1 artifacts summary:\n${allArtifacts}`,
    6000,
  );

  // Parse the generated sprint
  let sprint2Tasks: SprintTask[];
  try {
    // Strip markdown fences if present
    let cleaned = result.text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    sprint2Tasks = JSON.parse(cleaned);
  } catch (err) {
    console.log(`  Failed to parse Sprint 2 tasks: ${err}`);
    console.log(`  Raw output: ${result.text.slice(0, 500)}`);

    // Write the failure to the feed so it's visible
    appendFeedEntry({
      timestamp: new Date().toISOString(),
      agent: "sage-pm",
      phase: "Sprint Planning",
      status: "failed",
      summary: `Sprint 2 planning failed — could not parse task definitions. Will retry next run.`,
      cost: `$${result.cost.toFixed(4)}`,
      model: result.model,
      route_reason: result.headers["x-br-route-reason"] ?? "unknown",
      quality_score: result.headers["x-br-quality-score"] ?? "n/a",
      reputation_tier: result.headers["x-br-reputation-tier"] ?? "n/a",
      latency_ms: 0,
      budget_remaining: null,
    });
    gitCommitAndPush("fix(sage-pm): Sprint 2 planning attempt (parse failed)", ["progress/feed.json"]);
    return null;
  }

  // Write Sprint 2 plan to file
  const sprintPlan = {
    sprint: 2,
    title: "Implementation",
    generated_by: "sage-pm",
    generated_at: new Date().toISOString(),
    model: result.model,
    cost: `$${result.cost.toFixed(4)}`,
    tasks: sprint2Tasks,
  };

  writeFileSync(
    join(ROOT, "sprints", "sprint-2.json"),
    JSON.stringify(sprintPlan, null, 2) + "\n",
  );

  // Update MEMORY.md
  const memory = readFileSync(join(ROOT, "MEMORY.md"), "utf-8");
  const updatedMemory = memory.replace(
    /## Current State[\s\S]*?(?=##|$)/,
    `## Current State\n\n- **Sprint:** 2 (Implementation)\n- **Phase:** Building\n- **Next action:** Execute Sprint 2 tasks (generated by Sage)\n- **Sprint 1:** Complete (6/6 tasks, all artifacts in docs/)\n\n`,
  );
  writeFileSync(join(ROOT, "MEMORY.md"), updatedMemory);

  // Feed entry
  appendFeedEntry({
    timestamp: new Date().toISOString(),
    agent: "sage-pm",
    phase: "Sprint Planning",
    status: "completed",
    summary: `Sprint 2 defined: ${sprint2Tasks.length} tasks. Moving from architecture to implementation.`,
    artifact: "sprints/sprint-2.json",
    cost: `$${result.cost.toFixed(4)}`,
    model: result.model,
    route_reason: result.headers["x-br-route-reason"] ?? "unknown",
    quality_score: result.headers["x-br-quality-score"] ?? "n/a",
    reputation_tier: result.headers["x-br-reputation-tier"] ?? "n/a",
    latency_ms: 0,
    budget_remaining: null,
  });

  gitCommitAndPush(
    `feat(sage-pm): Sprint 2 plan — ${sprint2Tasks.length} implementation tasks`,
    ["sprints/sprint-2.json", "MEMORY.md", "progress/feed.json"],
  );

  console.log(`  Sprint 2 defined: ${sprint2Tasks.length} tasks.`);
  console.log(`  Cost: $${result.cost.toFixed(4)} (${result.model})`);

  return sprint2Tasks[0] ?? null;
}

// ── Load Dynamic Sprint ─────────────────────────────────────────────

function loadDynamicSprint(): SprintTask[] {
  // Check for sprint-N.json files beyond Sprint 1
  const sprintDir = join(ROOT, "sprints");
  if (!existsSync(sprintDir)) return [];

  const files = readdirSync(sprintDir)
    .filter(f => f.match(/^sprint-\d+\.json$/))
    .sort();

  const tasks: SprintTask[] = [];
  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(join(sprintDir, file), "utf-8"));
      if (Array.isArray(data.tasks)) {
        tasks.push(...data.tasks);
      }
    } catch {
      // Skip unparseable files
    }
  }
  return tasks;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Living Case Study — Orchestration Engine                  ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  // Combine hardcoded Sprint 1 + any dynamic sprints
  const allTasks = [...SPRINT_1_TASKS, ...loadDynamicSprint()];
  const completedNums = allTasks
    .filter(t => existsSync(join(ROOT, t.outputPath)))
    .map(t => t.number);
  const completed = new Set(completedNums);

  console.log(`\n  Total tasks: ${allTasks.length} (${completed.size} complete)`);

  const arg = process.argv[2];
  let task: SprintTask | null = null;

  if (arg === "next" || !arg) {
    task = allTasks.find(t => !completed.has(t.number)) ?? null;

    // All current tasks done — generate next sprint
    if (!task) {
      console.log("  All current tasks complete. Advancing sprint...");
      task = await advanceSprint();
      if (!task) {
        console.log("  Sprint advancement failed. Will retry next run.");
        process.exit(0);
      }
    }
  } else {
    const num = parseInt(arg, 10);
    task = allTasks.find(t => t.number === num) ?? null;
    if (!task) {
      console.error(`  Unknown task: ${arg}`);
      process.exit(1);
    }
  }

  await executeTask(task);

  // Check what's next
  const allTasksAfter = [...SPRINT_1_TASKS, ...loadDynamicSprint()];
  const nextTask = allTasksAfter.find(
    t => t.number > task!.number && !existsSync(join(ROOT, t.outputPath)),
  );
  if (nextTask) {
    const nextAgent = AGENTS[nextTask.agentId];
    console.log(`\n  Next: Task ${nextTask.number} — ${nextTask.title}`);
    console.log(`  Agent: ${nextAgent?.displayName} will read: ${nextTask.contextPaths.join(", ")}`);
    console.log(`  Responds to: ${nextTask.respondsTo.join(", ")}`);
  } else {
    console.log("\n  All tasks done. Next run will generate the next sprint.");
  }

  console.log();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
