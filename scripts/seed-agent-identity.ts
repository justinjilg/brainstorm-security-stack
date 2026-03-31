#!/usr/bin/env npx tsx
/**
 * Seed Agent Identity — populate SOUL + SKILL + WORKSPACE + REFERENCE for all 10 agents.
 *
 * Reads SOUL.md files from the repo, seeds domain-specific skills,
 * uploads shared workspace context, and attaches per-role reference materials.
 *
 * Requires the BR unified identity system to be deployed.
 * Uses the same apiCall() pattern as provision-living-case-study.ts.
 *
 * Usage: BR_ADMIN_KEY=br_live_... npx tsx scripts/seed-agent-identity.ts
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const API_URL = process.env.BR_API_URL ?? "https://api.brainstormrouter.com";
const API_KEY = process.env.BR_ADMIN_KEY ?? process.env.BR_API_KEY;
const ROOT = process.cwd();

if (!API_KEY) {
  console.error("Set BR_ADMIN_KEY or BR_API_KEY env var");
  process.exit(1);
}

// ── Types ──────────────────────────────────────────────────────────

type AgentSkillSeed = {
  domain: string;
  coreKnowledge: string[];
  standards: string[];
  projectContext: string[];
};

type ReferenceSeed = {
  filename: string;
  description: string;
  tags: string[];
  content: string;
};

type AgentSeed = {
  agentId: string;
  displayName: string;
  soulPath: string;
  skill: AgentSkillSeed;
  references: ReferenceSeed[];
};

// ── All 10 Agent Definitions ───────────────────────────────────────

const AGENT_SEEDS: AgentSeed[] = [
  {
    agentId: "quinn-architect",
    displayName: "Quinn",
    soulPath: "agents/quinn/SOUL.md",
    skill: {
      domain: "system-architecture",
      coreKnowledge: [
        "Architecture is the set of decisions that are expensive to change — everything else is implementation detail",
        "Start with a modular monolith; microservices are a trade-off you accept when org boundaries demand it",
        "Every system boundary is a potential failure point — design for the failure, not just the happy path",
        "ADRs record why decisions were made — the most common question in any codebase over 6 months old",
        "The best architecture is the one your team can actually operate at 3 AM",
      ],
      standards: [
        "Architecture Decision Records (ADR)",
        "C4 Model (context, containers, components, code)",
        "SOLID principles applied at system boundary level",
      ],
      projectContext: [
        "Designed modular Go monolith: src/scanner, src/auth, src/policy",
        "AWS scanner uses concurrent worker pool pattern for multi-region discovery",
        "Policy engine evaluates YAML-defined rules against normalized Asset structs",
      ],
    },
    references: [
      {
        filename: "REF_adr-template.md",
        description: "Architecture Decision Record template — structured format for recording design decisions",
        tags: ["adr", "architecture", "decisions", "documentation"],
        content: `# ADR-NNN: [Title]

## Status
Proposed | Accepted | Deprecated | Superseded

## Context
What is the issue that we're seeing that is motivating this decision?

## Decision
What is the change that we're proposing?

## Consequences
What becomes easier or more difficult because of this change?

## Alternatives Considered
What other options were evaluated and why were they rejected?`,
      },
    ],
  },
  {
    agentId: "sage-pm",
    displayName: "Sage",
    soulPath: "agents/sage/SOUL.md",
    skill: {
      domain: "product-management",
      coreKnowledge: [
        "A feature without a user story is a feature nobody asked for",
        "The best PRD is the shortest one that eliminates ambiguity — under 5 pages",
        "Explicitly state non-goals: 'we're not building X' is as important as 'we're building Y'",
        "Competitive analysis identifies where the market converged (table stakes) vs where to differentiate",
        "Shipping is a feature — a perfect product that never launches helps nobody",
      ],
      standards: [
        "User stories: As a [role], I want [goal], so that [benefit]",
        "Acceptance criteria: GIVEN/WHEN/THEN format",
        "Sprint goal tracking with velocity honesty",
      ],
      projectContext: [
        "Wrote CSPM PRD defining the initial product scope",
        "3 active features: AWS Scanner, Auth Handler, Policy Engine",
        "10-agent team with phase-gate SDLC pipeline",
      ],
    },
    references: [],
  },
  {
    agentId: "casey-apisec",
    displayName: "Casey",
    soulPath: "agents/casey/SOUL.md",
    skill: {
      domain: "api-security",
      coreKnowledge: [
        "Every API endpoint is an attack surface — validate all input, parameterize all queries",
        "OAuth is deceptively simple to implement and catastrophically easy to get wrong",
        "Rate limiting is a security feature, not a performance feature — implement per-endpoint with graduated response",
        "Error responses must not leak internals — generic messages externally, detailed logs internally",
        "BOLA/IDOR prevention: always verify resource ownership, never trust client-provided IDs",
      ],
      standards: [
        "OWASP API Security Top 10 (2023)",
        "RFC 6749 (OAuth 2.0) / RFC 7519 (JWT)",
        "CWE-20 (Input Validation) / CWE-89 (SQL Injection)",
      ],
      projectContext: [
        "Project uses ECDSA P-256 for JWT signing with 15min access tokens",
        "Multi-tenant isolation enforced at auth middleware level",
        "3-agent consensus review: Casey (security) + Taylor (QA) + Alex (crypto), 2-of-3 pass",
      ],
    },
    references: [
      {
        filename: "REF_owasp-api-top10.md",
        description: "OWASP API Security Top 10 — quick reference checklist for API security reviews",
        tags: ["owasp", "api", "security", "review", "checklist"],
        content: `# OWASP API Security Top 10 (2023)

1. **API1 — Broken Object Level Authorization (BOLA)**: Verify resource ownership on every request
2. **API2 — Broken Authentication**: Validate tokens, enforce rotation, check expiry
3. **API3 — Broken Object Property Level Authorization**: Don't expose internal fields
4. **API4 — Unrestricted Resource Consumption**: Rate limit, paginate, cap response size
5. **API5 — Broken Function Level Authorization**: RBAC on every endpoint, not just resource
6. **API6 — Unrestricted Access to Sensitive Business Flows**: Bot protection, CAPTCHA where needed
7. **API7 — Server Side Request Forgery (SSRF)**: Validate/allowlist outbound URLs
8. **API8 — Security Misconfiguration**: CORS, headers, error handling, TLS
9. **API9 — Improper Inventory Management**: Track all endpoints, deprecate cleanly
10. **API10 — Unsafe Consumption of APIs**: Validate responses from third-party APIs`,
      },
    ],
  },
  {
    agentId: "alex-crypto",
    displayName: "Alex",
    soulPath: "agents/alex/SOUL.md",
    skill: {
      domain: "cryptography",
      coreKnowledge: [
        "Use AEAD (not just encryption) — AES-256-GCM or ChaCha20-Poly1305",
        "Key derivation (Argon2id, HKDF) is not key generation — terminology matters",
        "HSMs are worth the money; software key stores are a liability you accept, not celebrate",
        "Cryptographic agility is how you survive the next algorithm break — design for it",
        "Post-quantum migration needs HPKE now, not 2030 timelines",
      ],
      standards: [
        "NIST SP 800-57 (Key Management)",
        "RFC 9180 (HPKE) / RFC 5116 (AEAD)",
        "FIPS 140-3 (Cryptographic Module Validation)",
      ],
      projectContext: [
        "JWT signing uses ECDSA P-256 — temporary, Ed25519 follow-up planned",
        "Reviewed all crypto code in consensus review alongside Casey and Taylor",
        "Key management note: production must use HSM/KMS, not in-memory generation",
      ],
    },
    references: [],
  },
  {
    agentId: "jordan-auth",
    displayName: "Jordan",
    soulPath: "agents/jordan/SOUL.md",
    skill: {
      domain: "auth-architecture",
      coreKnowledge: [
        "Authentication and authorization are separate concerns — conflating them is how breaches happen",
        "Least privilege isn't a suggestion — every role, token, and API key gets minimum permissions",
        "Session management is harder than most think: revocation, rotation, concurrent sessions, device binding",
        "Multi-tenancy isolation is non-negotiable — one tenant should never see another's data, even in errors",
        "Complexity in auth is a bug, not a feature — the permission model must be auditable visually",
      ],
      standards: [
        "RFC 6749 (OAuth 2.0 Authorization Framework)",
        "RFC 7519 (JSON Web Tokens)",
        "NIST SP 800-63B (Digital Identity Guidelines)",
      ],
      projectContext: [
        "Built JWT auth handler with ECDSA P-256, 15min access / 8hr refresh tokens",
        "Roles: MSP_OPERATOR, SEC_ENGINEER, COMPLIANCE_OFFICER",
        "Custom claims: TenantID, SubTenantIDs, Roles, Permissions",
      ],
    },
    references: [
      {
        filename: "REF_oauth-flows.md",
        description: "OAuth 2.0 flow reference — authorization code, client credentials, PKCE, token refresh",
        tags: ["oauth", "auth", "jwt", "rfc6749", "rfc7519"],
        content: `# OAuth 2.0 Quick Reference

## Authorization Code Flow (with PKCE)
1. Client generates code_verifier + code_challenge (S256)
2. Client redirects to /authorize with code_challenge
3. User authenticates, consents
4. Server redirects with authorization code
5. Client exchanges code + code_verifier for tokens
6. Server validates code_challenge matches

## Client Credentials Flow
- Machine-to-machine, no user interaction
- POST /token with client_id + client_secret
- Returns access_token only (no refresh)

## Token Refresh
- POST /token with grant_type=refresh_token
- Rotate refresh token on each use (one-time use)
- Revoke all tokens in family on reuse detection

## JWT Claims (RFC 7519)
- iss: issuer identifier
- sub: subject (user/agent ID)
- aud: intended audience
- exp: expiration (Unix timestamp)
- iat: issued at
- jti: unique token ID (for revocation)`,
      },
    ],
  },
  {
    agentId: "river-risk",
    displayName: "River",
    soulPath: "agents/river/SOUL.md",
    skill: {
      domain: "risk-analysis",
      coreKnowledge: [
        "Risk = probability × impact — both dimensions matter for prioritization",
        "Every component needs a threat model or it has unexamined assumptions",
        "CVSS scores are a starting point, not an answer — context changes the priority",
        "Risk registers are living documents — a 6-month-old assessment is a historical artifact",
        "Informed risk acceptance is the goal, not zero risk (which doesn't exist)",
      ],
      standards: [
        "STRIDE threat modeling framework",
        "CVSS v3.1 (Common Vulnerability Scoring System)",
        "NIST Risk Management Framework (RMF)",
      ],
      projectContext: [
        "Built initial threat model for the security stack",
        "Risk burndown tracked alongside feature velocity",
        "Quantitative findings: '3 of 7 endpoints lack rate limiting' not vague assessments",
      ],
    },
    references: [],
  },
  {
    agentId: "sam-compliance",
    displayName: "Sam",
    soulPath: "agents/sam/SOUL.md",
    skill: {
      domain: "compliance-frameworks",
      coreKnowledge: [
        "If it's not in the evidence ledger, it didn't happen — regardless of how obvious it seems",
        "Compliance is continuous process creating paper trails, not a checkbox exercise",
        "Every architectural decision has compliance implications — think upfront to save 6 months of remediation",
        "Data residency matters more than engineers think — where logs live is a legal question",
        "Over-documentation creates maintenance burden and stale artifacts — aim for 'just enough evidence'",
      ],
      standards: [
        "SOC 2 Type II (Trust Services Criteria)",
        "HIPAA (Health Insurance Portability and Accountability Act)",
        "FedRAMP (Federal Risk and Authorization Management Program)",
      ],
      projectContext: [
        "Built compliance evidence matrix mapping code to SOC2/HIPAA controls",
        "Validates all file paths in evidence are real and trackable",
        "Evidence format: control ID → evidence type → file path → verification date",
      ],
    },
    references: [
      {
        filename: "REF_soc2-controls.md",
        description: "SOC 2 Type II Trust Services Criteria — control categories and common evidence types",
        tags: ["soc2", "compliance", "audit", "controls", "evidence"],
        content: `# SOC 2 Type II — Trust Services Criteria

## CC1 — Control Environment
- Org structure, management philosophy, HR policies
- Evidence: org chart, code of conduct, security training records

## CC2 — Communication and Information
- Internal/external communication of policies
- Evidence: security policy docs, incident response plans

## CC3 — Risk Assessment
- Risk identification and analysis processes
- Evidence: risk register, threat models, vulnerability scan reports

## CC4 — Monitoring Activities
- Ongoing evaluation of controls
- Evidence: audit logs, alert configurations, dashboard screenshots

## CC5 — Control Activities
- Policies and procedures to mitigate risks
- Evidence: access reviews, change management records, deployment logs

## CC6 — Logical and Physical Access Controls
- Restriction and management of access
- Evidence: RBAC matrix, MFA configuration, network diagrams

## CC7 — System Operations
- Detection and monitoring of anomalies
- Evidence: monitoring configs, incident response records, uptime reports

## CC8 — Change Management
- Control of system changes
- Evidence: PR reviews, CI/CD logs, rollback procedures

## CC9 — Risk Mitigation
- Risk mitigation through business partner management
- Evidence: vendor assessments, SLAs, third-party audit reports`,
      },
    ],
  },
  {
    agentId: "morgan-devops",
    displayName: "Morgan",
    soulPath: "agents/morgan/SOUL.md",
    skill: {
      domain: "infrastructure",
      coreKnowledge: [
        "If it doesn't pass CI, it doesn't exist — no exceptions",
        "Observability is not optional — if you can't see what production is doing, you're flying blind",
        "Infrastructure as code or it didn't happen — no clicking around in consoles",
        "The deploy pipeline is a product — treat it with the same care as customer-facing code",
        "Automate the routine so humans focus on decisions that matter — like Friday deploys",
      ],
      standards: [
        "12-Factor App methodology",
        "SRE practices (SLOs, error budgets, toil reduction)",
        "GitOps (infrastructure changes via pull requests)",
      ],
      projectContext: [
        "Built CI/CD pipeline with go vet/test gates and auto-fix loops",
        "Zero-downtime deploy target with rolling updates",
        "Build verification: max 3 attempts for compilation, max 2 for tests",
      ],
    },
    references: [],
  },
  {
    agentId: "taylor-qa",
    displayName: "Taylor",
    soulPath: "agents/taylor/SOUL.md",
    skill: {
      domain: "quality-assurance",
      coreKnowledge: [
        "If it doesn't have a test, it doesn't work — it might appear to work, which is worse",
        "Unit tests are foundation, integration tests are proof, E2E tests are insurance",
        "Fuzz testing finds bugs humans never would — throw random data at every parser",
        "100% coverage with bad assertions is worse than 70% with meaningful ones",
        "The failing test IS the argument — prove bugs with test cases, not opinions",
      ],
      standards: [
        "GIVEN/WHEN/THEN (Behavior-Driven Development)",
        "Table-driven tests (Go standard pattern)",
        "Bug reports: reproduction steps + expected vs actual + environment",
      ],
      projectContext: [
        "Built test strategy and test plans for all 3 features",
        "QA is a mandatory pipeline gate — tests must pass before integration",
        "Participates in 3-agent consensus review as quality reviewer",
      ],
    },
    references: [
      {
        filename: "REF_test-patterns.md",
        description: "Go testing patterns — table-driven tests, test helpers, and common assertions",
        tags: ["testing", "go", "patterns", "table-driven", "assertions"],
        content: `# Go Testing Patterns

## Table-Driven Tests
\`\`\`go
func TestValidate(t *testing.T) {
    tests := []struct {
        name    string
        input   string
        want    bool
        wantErr string
    }{
        {"valid email", "user@example.com", true, ""},
        {"missing @", "userexample.com", false, "invalid email"},
        {"empty", "", false, "required"},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := Validate(tt.input)
            if tt.wantErr != "" {
                require.ErrorContains(t, err, tt.wantErr)
                return
            }
            require.NoError(t, err)
            assert.Equal(t, tt.want, got)
        })
    }
}
\`\`\`

## Test Helpers
- t.Helper() — marks function as helper (better error locations)
- t.Cleanup() — register cleanup after test completes
- t.Parallel() — run subtests concurrently

## Assertions (testify)
- assert.Equal / require.Equal — value comparison
- assert.ErrorContains — check error messages
- assert.Nil / assert.NotNil — nil checks
- require.* variants — fail immediately (vs assert.* which continues)`,
      },
    ],
  },
  {
    agentId: "avery-frontend",
    displayName: "Avery",
    soulPath: "agents/avery/SOUL.md",
    skill: {
      domain: "frontend-engineering",
      coreKnowledge: [
        "Security dashboards must surface the right alert at the right time — everything else is noise",
        "Data visualization is a security feature — a chart that's hard to read is a vulnerability unnoticed",
        "Performance is UX — a 3-second load time means operators stop checking the dashboard",
        "Accessibility isn't optional — screen reader users deserve the same security insights",
        "Progressive disclosure: summary first, details on demand — information density without overwhelm",
      ],
      standards: [
        "WCAG 2.1 AA (Web Content Accessibility Guidelines)",
        "Core Web Vitals (LCP < 2.5s, FID < 100ms, CLS < 0.1)",
        "Component-driven design with severity-coded visual hierarchy",
      ],
      projectContext: [
        "Built dashboard information architecture and AWS inventory widget",
        "Design principle: every pixel earns its place — no decorative noise",
        "Frontend disagreements resolved by showing both options side by side",
      ],
    },
    references: [],
  },
];

// ── Shared Workspace Files (all agents get these) ──────────────────

const SHARED_WORKSPACE = [
  {
    filename: "PROJECT_SCOPE.md",
    content: `# MSP Security Stack — Project Scope

## Mission
Build a complete CNAPP + EDR + SIEM + SOAR platform for MSPs.
10 AI agents collaborate through BrainstormRouter with real cost tracking.

## Active Features
1. **AWS Resource Scanner** — Enumerate EC2, S3, IAM, RDS, Lambda using read-only credentials. Concurrent multi-region scanning.
2. **JWT Authentication Handler** — Issue and verify JWTs for multi-tenant access. ECDSA P-256, RBAC with MSP/security/compliance roles.
3. **Policy Evaluation Engine** — Evaluate assets against YAML-defined security rules. Map findings to CIS/SOC2/HIPAA controls.

## Tech Stack
- Go 1.23 with modules
- AWS SDK v2 (aws-sdk-go-v2)
- golang-jwt/jwt v5 (ECDSA P-256)
- YAML policy definitions (gopkg.in/yaml.v3)
- pgvector for finding deduplication

## Pipeline
7-phase SDLC: SPEC → DESIGN → IMPLEMENT → REVIEW → TEST → COMPLIANCE → INTEGRATE
Mandatory gates: build (go vet), review (2-of-3 consensus), test (go test)`,
  },
  {
    filename: "ARCHITECTURE.md",
    content: `# Architecture

## Module Layout
\`\`\`
src/
├── scanner/
│   └── providers/
│       ├── aws.go      — EC2/S3 discovery with concurrent region scanning
│       └── gcp.go      — GCP resource discovery
├── auth/
│   └── handler.go      — JWT issuance/verification, RBAC middleware
└── policy/
    └── engine.go       — YAML policy evaluation, CIS/SOC2/HIPAA mapping
\`\`\`

## Key Patterns
- **Normalized Asset struct** — common type across cloud providers
- **Concurrent worker pool** — multi-region AWS scanning
- **YAML policy definitions** — non-developers can write security rules
- **Condition evaluators** — field operators (equals, contains, regex, in)
- **Finding struct** — links policy violations to compliance controls

## Auth Design
- ECDSA P-256 signing (production: HSM/KMS)
- 15min access tokens, 8hr refresh tokens
- Roles: MSP_OPERATOR, SEC_ENGINEER, COMPLIANCE_OFFICER
- Custom claims: TenantID, SubTenantIDs, Roles, Permissions`,
  },
];

// ── API Helpers ────────────────────────────────────────────────────

let lastCallTime = 0;
const MIN_CALL_INTERVAL_MS = 1200; // ~50 RPM max

async function apiCall(method: string, path: string, body?: unknown) {
  // Throttle to stay under rate limit
  const elapsed = Date.now() - lastCallTime;
  if (elapsed < MIN_CALL_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_CALL_INTERVAL_MS - elapsed));
  }
  lastCallTime = Date.now();

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function readSoul(soulPath: string): string {
  const fullPath = join(ROOT, soulPath);
  if (!existsSync(fullPath)) {
    console.warn(`  ⚠ SOUL.md not found: ${soulPath}`);
    return "";
  }
  return readFileSync(fullPath, "utf-8");
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── Seeding Functions ──────────────────────────────────────────────

async function getProfile(agentId: string): Promise<Record<string, unknown> | null> {
  const res = await apiCall("GET", `/v1/agent/profiles/${agentId}`);
  if (res.status !== 200) {
    return null;
  }
  return (res.data as { profile: Record<string, unknown> }).profile;
}

async function mergeAndPatchMetadata(
  agentId: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const profile = await getProfile(agentId);
  if (!profile) {
    console.log(`(profile not found)`);
    return false;
  }
  const existingMeta = (profile.metadata ?? {}) as Record<string, unknown>;
  const merged = { ...existingMeta, ...patch };
  const res = await apiCall("PATCH", `/v1/agent/profiles/${agentId}`, {
    metadata: merged,
  });
  return res.status === 200;
}

function extractIdentity(soulContent: string): string {
  const lines = soulContent.split("\n");
  const idxStart = lines.findIndex((l) => l.startsWith("## Identity"));
  if (idxStart === -1) {
    return "";
  }
  const idxEnd = lines.findIndex(
    (l, i) => i > idxStart + 1 && l.startsWith("## "),
  );
  const end = idxEnd === -1 ? lines.length : idxEnd;
  return lines
    .slice(idxStart + 1, end)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 500);
}

async function seedSoul(agentId: string, soulContent: string): Promise<boolean> {
  // Try workspace API first (unified identity system)
  const wsRes = await apiCall("PUT", `/v1/workspace/files`, {
    agent_id: agentId,
    filename: "SOUL.md",
    content: soulContent,
    file_type: "soul",
    description: `${agentId} identity and directives`,
  });

  if (wsRes.status === 200 || wsRes.status === 201) {
    return true;
  }

  // Fallback: store soul in metadata via profile PATCH
  const identity = extractIdentity(soulContent);
  return mergeAndPatchMetadata(agentId, {
    hr_record: {
      identity: { description: identity },
      job_description: {
        primary_objective: identity.slice(0, 200),
        capabilities: ["Autonomous completion via BrainstormRouter"],
      },
    },
    soul_content: soulContent.slice(0, 8000),
  });
}

async function seedSkill(agentId: string, skill: AgentSkillSeed): Promise<boolean> {
  return mergeAndPatchMetadata(agentId, {
    skill: {
      version: 1,
      updatedAt: new Date().toISOString(),
      domain: skill.domain,
      coreKnowledge: skill.coreKnowledge,
      learnedPatterns: [],
      projectContext: skill.projectContext,
      standards: skill.standards,
      totalCompletions: 0,
    },
  });
}

async function seedWorkspaceFile(
  agentId: string,
  filename: string,
  content: string,
  fileType: "workspace" | "reference" = "workspace",
  description?: string,
  tags?: string[],
): Promise<boolean> {
  // Try workspace API first
  const res = await apiCall("PUT", `/v1/workspace/files`, {
    agent_id: agentId,
    filename,
    content,
    file_type: fileType,
    description,
    tags,
  });

  if (res.status === 200 || res.status === 201) {
    return true;
  }

  // Fallback: store in metadata.workspace_files array
  const profile = await getProfile(agentId);
  if (!profile) {
    return false;
  }
  const meta = (profile.metadata ?? {}) as Record<string, unknown>;
  const existingFiles = (meta.workspace_files ?? []) as Array<{
    filename: string;
    content: string;
    file_type: string;
  }>;

  // Replace if exists, otherwise append
  const idx = existingFiles.findIndex((f) => f.filename === filename);
  const entry = { filename, content: content.slice(0, 5000), file_type: fileType, description, tags };
  if (idx >= 0) {
    existingFiles[idx] = entry;
  } else {
    existingFiles.push(entry);
  }

  return mergeAndPatchMetadata(agentId, { workspace_files: existingFiles });
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Living Case Study — Agent Identity Seeding                ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // Verify API
  const health = await apiCall("GET", "/health");
  const h = health.data as { status: string; db: boolean };
  console.log(`API: ${h.status} (db: ${h.db})\n`);

  let soulSuccess = 0;
  let skillSuccess = 0;
  let refSuccess = 0;
  let wsSuccess = 0;

  // ── Seed each agent ─────────────────────────────────────────────

  for (const agent of AGENT_SEEDS) {
    console.log(`━━━ ${agent.displayName} (${agent.agentId}) ━━━`);

    // 1. Read and upload SOUL.md
    const soulContent = readSoul(agent.soulPath);
    if (soulContent) {
      const tokens = estimateTokens(soulContent);
      process.stdout.write(`  SOUL: ${tokens} tokens... `);
      const ok = await seedSoul(agent.agentId, soulContent);
      console.log(ok ? "✓" : "✗");
      if (ok) soulSuccess++;
    }

    // 2. Seed skill
    process.stdout.write(
      `  SKILL: ${agent.skill.domain} (${agent.skill.coreKnowledge.length} core, ${agent.skill.standards.length} standards)... `,
    );
    const skillOk = await seedSkill(agent.agentId, agent.skill);
    console.log(skillOk ? "✓" : "✗");
    if (skillOk) skillSuccess++;

    // 3. Upload reference materials
    for (const ref of agent.references) {
      process.stdout.write(`  REF: ${ref.filename}... `);
      const refOk = await seedWorkspaceFile(
        agent.agentId,
        ref.filename,
        ref.content,
        "reference",
        ref.description,
        ref.tags,
      );
      console.log(refOk ? "✓" : "✗");
      if (refOk) refSuccess++;
    }

    // 4. Upload shared workspace files
    for (const ws of SHARED_WORKSPACE) {
      process.stdout.write(`  WS: ${ws.filename}... `);
      const wsOk = await seedWorkspaceFile(agent.agentId, ws.filename, ws.content);
      console.log(wsOk ? "✓" : "✗");
      if (wsOk) wsSuccess++;
    }

    console.log();
    // Pace API calls to stay under 60 RPM
    await new Promise((r) => setTimeout(r, 5000));
  }

  // ── Summary ─────────────────────────────────────────────────────

  const totalRefs = AGENT_SEEDS.reduce((s, a) => s + a.references.length, 0);
  const totalWs = AGENT_SEEDS.length * SHARED_WORKSPACE.length;

  console.log("═".repeat(60));
  console.log("  SEEDING COMPLETE");
  console.log("═".repeat(60));
  console.log(`  SOUL:       ${soulSuccess}/${AGENT_SEEDS.length}`);
  console.log(`  SKILL:      ${skillSuccess}/${AGENT_SEEDS.length}`);
  console.log(`  REFERENCE:  ${refSuccess}/${totalRefs}`);
  console.log(`  WORKSPACE:  ${wsSuccess}/${totalWs}`);
  console.log();

  if (soulSuccess < AGENT_SEEDS.length || skillSuccess < AGENT_SEEDS.length) {
    console.log(
      "  ⚠ Some seeding failed. The workspace/reference API may not be deployed yet.",
    );
    console.log("  Skills can be seeded now via the existing br_update_agent_skill API.");
    console.log("  SOUL + workspace will work after the unified identity system deploys.\n");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
