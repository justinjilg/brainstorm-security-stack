#!/usr/bin/env npx tsx
/**
 * Agent Introductions — each agent calls BR to introduce themselves.
 *
 * Real completions. Real costs. Real routing. Every introduction
 * is a genuine LLM call through BrainstormRouter with the agent's JWT.
 *
 * Output: writes to progress/feed.json with each agent's introduction.
 *
 * Usage: BR_ADMIN_KEY=br_live_... npx tsx scripts/agent-introductions.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const API_URL = process.env.BR_API_URL ?? "https://api.brainstormrouter.com";
const ADMIN_KEY = process.env.BR_ADMIN_KEY;

if (!ADMIN_KEY) {
  console.error("Set BR_ADMIN_KEY env var");
  process.exit(1);
}

const AGENTS = [
  {
    agent_id: "quinn-architect",
    model: "anthropic/claude-opus-4-6",
    soul: "I design systems. I think about component boundaries, data flow, failure modes, and the decisions that are expensive to change later.",
  },
  {
    agent_id: "sage-pm",
    model: "openai/gpt-4.1",
    soul: "I translate market needs into buildable specs. I write PRDs that engineers actually want to read.",
  },
  {
    agent_id: "casey-apisec",
    model: "anthropic/claude-sonnet-4-6",
    soul: "I own the API surface — authentication, authorization, rate limiting, input validation. Every endpoint is an attack surface.",
  },
  {
    agent_id: "alex-crypto",
    model: "anthropic/claude-sonnet-4-6",
    soul: "I'm the cryptography specialist. Key management, TLS configurations, post-quantum migration. Most security products get crypto wrong.",
  },
  {
    agent_id: "jordan-auth",
    model: "anthropic/claude-opus-4-6",
    soul: "I design identity systems. OAuth flows, RBAC/ABAC policies, session management. Getting it wrong means either your users can't log in or everyone can access everything.",
  },
  {
    agent_id: "river-risk",
    model: "google/gemini-2.5-flash",
    soul: "I quantify risk. While others see features, I see attack surfaces, threat vectors, and probability distributions.",
  },
  {
    agent_id: "sam-compliance",
    model: "anthropic/claude-sonnet-4-6",
    soul: "I'm the evidence keeper. If it's not in the ledger, it didn't happen. I care about SOC2, HIPAA, FedRAMP.",
  },
  {
    agent_id: "morgan-devops",
    model: "anthropic/claude-sonnet-4-6",
    soul: "I build the pipelines, the infrastructure, and the deployment machinery. If it doesn't pass CI, it doesn't exist.",
  },
  {
    agent_id: "taylor-qa",
    model: "anthropic/claude-sonnet-4-6",
    soul: "I break things so users don't have to. I think about edge cases, race conditions, malformed input, clock skew.",
  },
  {
    agent_id: "avery-frontend",
    model: "anthropic/claude-sonnet-4-6",
    soul: "I build the dashboard — the surface where all the security data becomes actionable. If an operator can't understand the security posture in 10 seconds, I've failed.",
  },
];

async function getAgentJwt(agentId: string): Promise<string> {
  const res = await fetch(`${API_URL}/v1/agent/bootstrap`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ADMIN_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ agent_id: agentId }),
  });
  const data = (await res.json()) as { jwt?: string };
  if (!data.jwt) throw new Error(`No JWT for ${agentId}: ${JSON.stringify(data)}`);
  return data.jwt;
}

async function agentIntroduce(
  agentId: string,
  model: string,
  soul: string,
  jwt: string,
): Promise<{
  text: string;
  model_used: string;
  cost: number;
  budget_remaining: number | null;
  route_reason: string;
  quality_score: string;
  reputation_tier: string;
  latency_ms: number;
}> {
  const res = await fetch(`${API_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: `You are ${agentId.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ").replace(/-/g, " ")}, an AI agent on the Living Case Study team — a public project building Wiz + CrowdStrike + SentinelOne from scratch with AI agents.

Your identity: ${soul}

You are introducing yourself to the public for the first time. This introduction will be posted on brainstorm.co/live as your first check-in.

Write a 2-3 sentence introduction in first person. Be direct, specific about what you'll be doing on this project, and show your personality from your SOUL.md. Don't be generic or corporate. Don't use emojis. Mention your specific domain expertise and what you're looking forward to building.`,
        },
        {
          role: "user",
          content: `Introduce yourself to the community. This is your first public check-in on the Living Case Study. Your agent ID is ${agentId} and you will be working on the ${agentId.split("-")[1] ?? agentId} domain. Speak as yourself — not as any other agent. Be specific about YOUR expertise and YOUR role.`,
        },
      ],
      max_tokens: 200,
      temperature: 0.7,
    }),
  });

  const headers: Record<string, string> = {};
  for (const [key, value] of res.headers.entries()) {
    if (key.startsWith("x-br-")) headers[key] = value;
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  if (!data.choices?.[0]?.message?.content) {
    throw new Error(`Empty response for ${agentId}: ${JSON.stringify(data)}`);
  }

  return {
    text: data.choices[0].message.content,
    model_used: data.model ?? model,
    cost: parseFloat(headers["x-br-actual-cost"] ?? "0"),
    budget_remaining: headers["x-br-budget-remaining"]
      ? parseFloat(headers["x-br-budget-remaining"])
      : null,
    route_reason: headers["x-br-route-reason"] ?? "unknown",
    quality_score: headers["x-br-quality-score"] ?? "n/a",
    reputation_tier: headers["x-br-reputation-tier"] ?? "n/a",
    latency_ms: parseInt(headers["x-br-total-latency-ms"] ?? "0", 10),
  };
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Living Case Study — Agent Introductions via BR            ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const feedPath = resolve(process.cwd(), "progress", "feed.json");
  const feed = JSON.parse(readFileSync(feedPath, "utf-8"));
  feed.checkins = feed.checkins ?? [];

  let totalCost = 0;

  for (const agent of AGENTS) {
    process.stdout.write(`  ${agent.agent_id.padEnd(18)} → ${agent.model.padEnd(30)} `);

    try {
      const jwt = await getAgentJwt(agent.agent_id);
      const result = await agentIntroduce(agent.agent_id, agent.model, agent.soul, jwt);

      totalCost += result.cost;

      const checkin = {
        timestamp: new Date().toISOString(),
        agent: agent.agent_id,
        phase: "Introduction",
        status: "ready",
        summary: result.text,
        cost: `$${result.cost.toFixed(4)}`,
        model: result.model_used,
        route_reason: result.route_reason,
        quality_score: result.quality_score,
        reputation_tier: result.reputation_tier,
        latency_ms: result.latency_ms,
        budget_remaining: result.budget_remaining,
      };

      feed.checkins.push(checkin);

      console.log(`$${result.cost.toFixed(4)}  ${result.latency_ms}ms  ✓`);
      console.log(`${"".padEnd(52)}${result.text.slice(0, 80)}...`);
      console.log();
    } catch (err) {
      console.log(`✗ ${err instanceof Error ? err.message : String(err)}`);
    }

    // Polite delay between agents
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Write feed
  writeFileSync(feedPath, JSON.stringify(feed, null, 2) + "\n");

  console.log("═".repeat(60));
  console.log(`  Total cost: $${totalCost.toFixed(4)}`);
  console.log(`  Checkins:   ${feed.checkins.length}`);
  console.log(`  Feed:       ${feedPath}`);
  console.log("═".repeat(60));
  console.log();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
