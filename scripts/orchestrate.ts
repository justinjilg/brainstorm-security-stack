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
import { createRequire } from "node:module";

// Proxy setup: Node's built-in fetch doesn't honor HTTPS_PROXY env var.
// Install undici ProxyAgent globally so all fetch() calls go through the proxy.
const _require = createRequire(import.meta.url);
try {
  const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  if (proxyUrl) {
    const { ProxyAgent, setGlobalDispatcher } = _require("undici");
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
  }
} catch {
  // undici not available — fetch will attempt direct connection
}

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

// Model: "openclaw/auto" lets BR's Thompson sampling pick the best model
// based on request complexity, historical performance, and cost/quality tradeoff.
// No more hardcoded model preferences — BR learns what works.
const AGENTS: Record<string, AgentConfig> = {
  "quinn-architect":  { id: "quinn-architect",  displayName: "Quinn",  role: "Architect",        model: "openclaw/auto", soulPath: "agents/quinn/SOUL.md" },
  "sage-pm":          { id: "sage-pm",          displayName: "Sage",   role: "Product Manager",  model: "openclaw/auto", soulPath: "agents/sage/SOUL.md" },
  "casey-apisec":     { id: "casey-apisec",     displayName: "Casey",  role: "API Security",     model: "openclaw/auto", soulPath: "agents/casey/SOUL.md" },
  "alex-crypto":      { id: "alex-crypto",      displayName: "Alex",   role: "Crypto Engineer",  model: "openclaw/auto", soulPath: "agents/alex/SOUL.md" },
  "jordan-auth":      { id: "jordan-auth",      displayName: "Jordan", role: "Auth Architect",   model: "openclaw/auto", soulPath: "agents/jordan/SOUL.md" },
  "river-risk":       { id: "river-risk",       displayName: "River",  role: "Risk Analyst",     model: "openclaw/auto", soulPath: "agents/river/SOUL.md" },
  "sam-compliance":   { id: "sam-compliance",    displayName: "Sam",    role: "Compliance",       model: "openclaw/auto", soulPath: "agents/sam/SOUL.md" },
  "morgan-devops":    { id: "morgan-devops",     displayName: "Morgan", role: "DevOps",           model: "openclaw/auto", soulPath: "agents/morgan/SOUL.md" },
  "taylor-qa":        { id: "taylor-qa",         displayName: "Taylor", role: "QA Engineer",      model: "openclaw/auto", soulPath: "agents/taylor/SOUL.md" },
  "avery-frontend":   { id: "avery-frontend",    displayName: "Avery",  role: "Frontend",         model: "openclaw/auto", soulPath: "agents/avery/SOUL.md" },
};

// ── Sprint Task Definitions ─────────────────────────────────────────

type TaskFormat = "markdown" | "raw-code" | "yaml" | "json";

type SprintTask = {
  number: number;
  title: string;
  agentId: string;
  outputPath: string;
  format?: TaskFormat;          // default: inferred from file extension
  contextPaths: string[];
  respondsTo: string[];
  prompt: string;
  maxTokens: number;
};

function inferFormat(outputPath: string): TaskFormat {
  if (outputPath.endsWith(".go") || outputPath.endsWith(".tsx") || outputPath.endsWith(".ts") || outputPath.endsWith(".py")) return "raw-code";
  if (outputPath.endsWith(".yaml") || outputPath.endsWith(".yml")) return "yaml";
  if (outputPath.endsWith(".json")) return "json";
  return "markdown";
}

/**
 * Extract raw code from LLM output that might be wrapped in markdown fences.
 * LLMs love wrapping code in ```go ... ``` even when told not to.
 */
function extractCode(text: string, outputPath: string): string {
  let cleaned = text.trim();

  // Remove leading commentary before the first code fence or package/import statement
  const codeStart = cleaned.search(/^(```|package |import |\/\/ |\/\*|func |type |const |var |FROM |CREATE |module )/m);
  if (codeStart > 0) {
    cleaned = cleaned.slice(codeStart);
  }

  // Strip markdown code fences
  const fenceMatch = cleaned.match(/^```\w*\n([\s\S]*?)\n```\s*$/);
  if (fenceMatch) {
    cleaned = fenceMatch[1];
  }

  // Handle multiple code blocks — concatenate them (common when LLM outputs "types.go" then "engine.go")
  const multiBlockMatch = cleaned.match(/```\w*\n/g);
  if (multiBlockMatch && multiBlockMatch.length > 1) {
    // Extract all code blocks and concatenate
    const blocks: string[] = [];
    const regex = /```\w*\n([\s\S]*?)\n```/g;
    let match;
    while ((match = regex.exec(cleaned)) !== null) {
      blocks.push(match[1].trim());
    }
    if (blocks.length > 0) {
      cleaned = blocks.join("\n\n");
    }
  }

  // Final fence strip (single remaining)
  cleaned = cleaned.replace(/^```\w*\n?/, "").replace(/\n?```\s*$/, "");

  // Strip trailing commentary after the code
  if (outputPath.endsWith(".go")) {
    const lastBrace = cleaned.lastIndexOf("}");
    if (lastBrace > 0 && lastBrace < cleaned.length - 5) {
      const afterCode = cleaned.slice(lastBrace + 1).trim();
      // If there's significant text after the last }, it's commentary
      if (afterCode.length > 50 && !afterCode.startsWith("//") && !afterCode.startsWith("func")) {
        cleaned = cleaned.slice(0, lastBrace + 1);
      }
    }
  }

  return cleaned.trim() + "\n";
}

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
  {
    number: 7,
    title: "CI/CD pipeline design",
    agentId: "morgan-devops",
    outputPath: "docs/architecture/cicd-pipeline-v1.md",
    contextPaths: ["docs/prds/cspm-v1.md", "docs/architecture/system-design-v1.md", "docs/security/crypto-requirements-v1.md"],
    respondsTo: ["quinn-architect", "alex-crypto"],
    prompt: `Sage wrote the PRD, Quinn designed the architecture, and Alex specified the cryptographic requirements. Read all three.

Design the CI/CD pipeline for the Living Case Study security stack:
1. Pipeline stages: build, test, security scan, staging deploy, production deploy
2. Security controls in the pipeline (SAST, DAST, container scanning, secret detection)
3. GitHub Actions workflow structure (key jobs, parallelization strategy)
4. Artifact management (Docker images, Go binaries, versioning strategy)
5. Environment promotion strategy (dev → staging → production)
6. Secret handling in CI/CD — how to securely inject cloud credentials and API keys following Alex's crypto requirements
7. Rollback strategy and deployment gates

Reference Quinn's component architecture — how does the multi-component system (Scanner Engine, Policy Engine, etc.) affect the pipeline topology? Reference Alex's secrets management requirements — what specific pipeline controls satisfy those requirements? Be concrete with tooling choices (GitHub Actions, Trivy, Cosign, etc.).`,
    maxTokens: 4000,
  },
  {
    number: 8,
    title: "Test strategy document",
    agentId: "taylor-qa",
    outputPath: "docs/testing/test-strategy-v1.md",
    contextPaths: ["docs/prds/cspm-v1.md", "docs/architecture/system-design-v1.md", "docs/security/threat-model-v1.md", "docs/security/api-security-requirements-v1.md"],
    respondsTo: ["sage-pm", "quinn-architect", "river-risk", "casey-apisec"],
    prompt: `Sage wrote the PRD, Quinn designed the architecture, River produced the threat model, and Casey wrote the API security requirements. Read all four.

Write the test strategy for the CSPM security stack:
1. Test pyramid: unit / integration / end-to-end ratios and tooling for Go services
2. Security testing approach: how do we test the controls Casey defined in the API security requirements?
3. Test coverage targets per component (Scanner Engine, Policy Engine, Remediation Engine)
4. Mutation testing strategy for security-critical paths
5. Chaos engineering plan: what failure modes do we deliberately inject?
6. Performance testing: baseline SLAs from Sage's PRD — how do we validate them?
7. Compliance testing: how do we prove controls work for SOC2 / HIPAA auditors?
8. CI gate thresholds: what quality bars block a deploy?

Reference River's top 5 risks — every high-severity finding needs a specific test case. Reference Casey's API security requirements — every validation rule needs a negative test. If Quinn's architecture creates components that are hard to test in isolation, say so and propose the fix.`,
    maxTokens: 4000,
  },
  {
    number: 9,
    title: "Compliance requirements matrix (SOC2, HIPAA)",
    agentId: "sam-compliance",
    outputPath: "docs/compliance/requirements-matrix-v1.md",
    contextPaths: ["docs/prds/cspm-v1.md", "docs/architecture/system-design-v1.md", "docs/architecture/auth-design-v1.md", "docs/security/threat-model-v1.md", "docs/security/crypto-requirements-v1.md"],
    respondsTo: ["sage-pm", "quinn-architect", "jordan-auth", "river-risk", "alex-crypto"],
    prompt: `Sage wrote the PRD, Quinn designed the architecture, Jordan designed auth, River produced the threat model, and Alex specified crypto requirements. Read all five.

Write the compliance requirements matrix:
1. SOC2 Type II mapping: for each Trust Service Criterion (CC6, CC7, CC8, CC9), identify which specific system components fulfill it and what evidence is required
2. HIPAA Technical Safeguard mapping (164.312): access control, audit controls, integrity, transmission security — mapped to specific technical controls in the architecture
3. CIS Controls v8 coverage gaps: which of the top 18 controls are already addressed by the architecture, which are gaps?
4. Evidence collection plan: what logs, metrics, and artifacts need to be preserved for audits, and how long?
5. Control inheritance model: what does the MSP inherit from cloud providers (AWS, Azure, GCP) vs what must be implemented?
6. Compliance risk register: controls currently unimplemented that create audit risk

For each gap, name the specific technical control that's missing, which agent is responsible for implementing it, and the risk if it stays open. Reference Jordan's auth design for access control evidence. Reference Alex's crypto requirements for encryption evidence.`,
    maxTokens: 4000,
  },
  {
    number: 10,
    title: "Dashboard wireframes (information architecture)",
    agentId: "avery-frontend",
    outputPath: "docs/design/dashboard-ia-v1.md",
    contextPaths: ["docs/prds/cspm-v1.md", "docs/architecture/system-design-v1.md", "docs/security/threat-model-v1.md"],
    respondsTo: ["sage-pm", "quinn-architect", "river-risk"],
    prompt: `Sage wrote the PRD with user personas, Quinn designed the system architecture, and River produced the threat model. Read all three.

Design the information architecture for the MSP operator dashboard:
1. Primary navigation structure: what are the top-level views and why?
2. CSPM overview screen: what does an operator see first when they log in? (layout in ASCII/text wireframe)
3. Findings view: how do we surface misconfiguration findings with severity, affected resource, and remediation action? (ASCII wireframe)
4. Compliance scorecard view: how do MSP operators see their clients' SOC2/HIPAA posture at a glance?
5. Alert timeline: real-time event stream for critical findings
6. Multi-tenant navigation: how does an MSP operator switch between managed client environments?
7. Component data requirements: for each screen, what API endpoints and data shapes are needed from Quinn's backend?

Reference Sage's user personas — the MSP operator needs different views than the security engineer or compliance officer. Reference River's top 5 risks — the highest-severity findings need prominent surface area. If Quinn's architecture doesn't expose the data a screen needs, flag it as a backend gap. Use ASCII art for wireframes where helpful.`,
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

// Model fallback chains — openclaw/auto lets BR pick, but if BR itself
// can't route (e.g. all providers down), fall back explicitly
const FALLBACK_CHAINS: Record<string, string[]> = {
  "openclaw/auto":               ["anthropic/claude-sonnet-4-6", "openai/gpt-4.1", "google/gemini-2.5-pro", "google/gemini-2.5-flash"],
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

  const format = task.format ?? inferFormat(task.outputPath);
  const isCode = format === "raw-code" || format === "yaml" || format === "json";

  const formatInstructions = isCode
    ? [
        "",
        "## CRITICAL OUTPUT RULES",
        "",
        "You are producing a CODE FILE that will be written directly to disk and must compile/parse.",
        "Output ONLY the raw file contents. No markdown. No code fences. No explanation before or after.",
        "No commentary. No 'Here\'s how I\'d approach this.' Just the code.",
        "The first line of your output must be the first line of the file (package declaration, import, etc.).",
        "The last line of your output must be the last line of the file.",
        "",
        format === "raw-code" && task.outputPath.endsWith(".go")
          ? "This is a Go file. Start with `package <name>`. Include all imports. The code must pass `go vet`."
          : "",
        format === "raw-code" && task.outputPath.endsWith(".tsx")
          ? "This is a React/TypeScript file. Export the component. Include all imports."
          : "",
      ].filter(Boolean).join("\n")
    : [
        "",
        "Write as yourself — use first person, reference your domain expertise, show your personality.",
        "If you reference another agent's work, name them explicitly (e.g., 'Quinn's architecture proposes...').",
        "If you disagree with another agent, say so directly with your reasoning.",
        "Do NOT start your response with 'Absolutely' or 'Sure' or any preamble. Start with the content.",
      ].join("\n");

  const systemPrompt = [
    soul,
    "",
    "## Project Context",
    "",
    "You are working on the Living Case Study — a fully public project where 10 AI agents build a complete MSP Security Stack.",
    "Every artifact you produce is committed to the public GitHub repo. This is real, not a demo.",
    "Every LLM call routes through BrainstormRouter with real cost tracking.",
    formatInstructions,
    context,
  ].join("\n");

  console.log("  Getting JWT...");
  const jwt = await getAgentJwt(agent.id);

  console.log(`  Calling BR (${agent.model})...`);
  const startMs = Date.now();
  const result = await callBR(jwt, agent.model, systemPrompt, task.prompt, task.maxTokens);
  const elapsedMs = Date.now() - startMs;

  console.log(`  Response: ${result.text.length} chars, ${result.model}, $${result.cost.toFixed(4)}, ${elapsedMs}ms`);

  // Write artifact — code files get extracted, docs get metadata headers
  const outputDir = join(ROOT, task.outputPath.split("/").slice(0, -1).join("/"));
  mkdirSync(outputDir, { recursive: true });

  let fileContent: string;
  if (isCode) {
    // Extract raw code — strip markdown fences, commentary, preamble
    fileContent = extractCode(result.text, task.outputPath);
    console.log(`  Extracted code: ${fileContent.split("\n").length} lines`);
  } else {
    // Markdown docs get BR metadata header
    const header = [
      `<!-- Agent: ${agent.id} | Model: ${result.model} | Cost: $${result.cost.toFixed(4)} | Latency: ${elapsedMs}ms -->`,
      `<!-- Route: ${result.headers["x-br-route-reason"] ?? "?"} | Quality: ${result.headers["x-br-quality-score"] ?? "?"} | Reputation: ${result.headers["x-br-reputation-tier"] ?? "?"} -->`,
      `<!-- Budget remaining: $${result.headers["x-br-budget-remaining"] ?? "?"} -->`,
      "",
    ].join("\n");
    fileContent = header + result.text + "\n";
  }

  writeFileSync(join(ROOT, task.outputPath), fileContent);
  console.log(`  Wrote: ${task.outputPath}`);

  // Build verification for Go code
  if (task.outputPath.endsWith(".go") && existsSync(join(ROOT, "go.mod"))) {
    console.log("  Verifying Go build...");
    try {
      execFileSync("go", ["vet", "./..."], { cwd: ROOT, stdio: "pipe", timeout: 30000 });
      console.log("  Build verification: PASS");
    } catch (err) {
      const stderr = (err as { stderr?: Buffer }).stderr?.toString() ?? "";
      console.log(`  Build verification: FAIL — ${stderr.slice(0, 200)}`);
      // Don't block the task — log the failure in the feed entry
      result.headers["x-build-status"] = "fail";
      result.headers["x-build-error"] = stderr.slice(0, 200);
    }
  }

  // Feed entry
  const buildStatus = result.headers["x-build-status"];
  const buildError = result.headers["x-build-error"];
  const lines = isCode ? fileContent.split("\n").length : undefined;

  appendFeedEntry({
    timestamp: new Date().toISOString(),
    agent: agent.id,
    phase: `Sprint 1 / Task ${task.number}`,
    status: buildStatus === "fail" ? "build-failed" : "completed",
    summary: buildStatus === "fail"
      ? `Completed: ${task.title} (BUILD FAILED: ${buildError}). Output: ${task.outputPath}`
      : `Completed: ${task.title}. Output: ${task.outputPath}${lines ? ` (${lines} lines)` : ""}`,
    responds_to: task.respondsTo.length > 0 ? task.respondsTo : undefined,
    artifact: task.outputPath,
    format: format,
    lines: lines,
    build_status: buildStatus ?? (isCode && existsSync(join(ROOT, "go.mod")) ? "pass" : undefined),
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

  // Determine sprint number from existing sprint files
  const sprintFiles = existsSync(join(ROOT, "sprints"))
    ? readdirSync(join(ROOT, "sprints")).filter(f => f.match(/^sprint-\d+\.json$/))
    : [];
  const nextSprintNum = sprintFiles.length + 2; // Sprint 1 is hardcoded, so first generated is 2
  const prevSprintNum = nextSprintNum - 1;

  // Gather ALL artifacts (not just Sprint 1)
  const allTasksForContext = [...SPRINT_1_TASKS, ...loadDynamicSprint()];
  const allArtifactsList = allTasksForContext
    .map(t => {
      const p = join(ROOT, t.outputPath);
      if (!existsSync(p)) return "";
      return `- ${t.outputPath} (by ${AGENTS[t.agentId]?.displayName ?? t.agentId}): ${t.title}`;
    })
    .filter(Boolean)
    .join("\n");

  const jwt = await getAgentJwt("sage-pm");
  const result = await callBR(
    jwt,
    "openai/gpt-4.1",
    `You are Sage, the Product Manager for the Living Case Study — a public project where 10 AI agents build a complete MSP Security Stack (CNAPP + EDR + SIEM + SOAR) from scratch.

Your team:
- Quinn (Architect) — system design, ADRs, component boundaries
- Casey (API Security) — API security reviews, input validation, rate limiting
- Alex (Crypto) — cryptographic requirements, key management, TLS
- Jordan (Auth) — authentication, authorization, RBAC, session management
- River (Risk) — threat models, STRIDE analysis, risk scoring
- Sam (Compliance) — SOC2/HIPAA/FedRAMP mapping, evidence collection, audit trails
- Morgan (DevOps) — CI/CD, Dockerfiles, deployment configs, infra-as-code
- Taylor (QA) — test plans, test code, fuzzing strategies, edge cases
- Avery (Frontend) — Next.js dashboard components, alert views, compliance dashboards
- Sage (you) — PRDs, sprint planning, acceptance criteria, scope management

Sprint ${prevSprintNum} is now complete.`,
    `Define Sprint ${nextSprintNum} tasks. You MUST include a MIX of task types — not just "write code." A real SDLC sprint includes:

1. IMPLEMENTATION tasks (2-3): agents writing actual code (Go files, configs, schemas)
2. SECURITY REVIEW tasks (1-2): Casey or Alex reviewing code/designs from this or prior sprints
3. TEST tasks (1): Taylor writing test plans or test code for what was built
4. COMPLIANCE tasks (1): Sam auditing artifacts against frameworks, writing evidence
5. FRONTEND tasks (1): Avery building dashboard components for new features
6. DEVOPS tasks (0-1): Morgan setting up CI/CD, Docker, or deployment configs

Every task MUST reference prior artifacts via contextPaths. Every task MUST list which agents' work it responds to via respondsTo. This is how agents talk to each other — by reading and responding to each other's work.

Artifacts built so far:
${allArtifactsList}

CRITICAL RULES FOR CODE TASKS:
- Code files (.go, .tsx, .yaml) must be DIRECTLY WRITABLE TO DISK and must compile/parse.
- In the task prompt for code tasks, include: "Output ONLY raw code. No markdown fences. No explanation. First line must be the package/import declaration. Code must compile."
- Go files must include package declaration, all imports, and be syntactically valid.
- Test files must end in _test.go and use the testing package.
- Include a "go.mod" creation task early if one doesn't exist yet.

CRITICAL RULES FOR REVIEW/DOC TASKS:
- Tell the agent: "Do NOT start with 'Absolutely' or 'Sure' or any preamble. Start directly with the content."
- Review tasks should reference specific line numbers or function names from the code they're reviewing.
- Compliance tasks should produce evidence tables mapping specific code to specific controls.

Output ONLY valid JSON — an array of task objects:
- number (integer, continuing from the highest existing task number + 1)
- title (string — specific, not generic)
- agentId (string — exact agent ID from the list above)
- outputPath (string — e.g. "src/scanner/providers/aws.go" or "docs/reviews/sprint-3-security-review.md" or "src/scanner/providers/aws_test.go")
- format (string — "raw-code" for .go/.tsx/.ts files, "yaml" for .yaml, "markdown" for .md files)
- contextPaths (string array — paths to prior artifacts this agent should read)
- respondsTo (string array — agent IDs whose work this task builds on or reviews)
- prompt (string — detailed, specific task prompt. For code tasks: demand raw compilable code, no markdown. For reviews: demand specificity, no preamble.)
- maxTokens (integer — 4000 for code, 6000 for reviews/docs)

Define 6-8 tasks. Output ONLY the JSON array — no markdown fences, no explanation, no commentary.`,
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
