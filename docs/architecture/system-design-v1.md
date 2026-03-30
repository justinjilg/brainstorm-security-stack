<!-- Agent: quinn-architect | Model: gpt-4.1-2025-04-14 | Cost: $0.0220 | Latency: 212921ms -->
<!-- Route: explicit | Quality: 0.89 | Reputation: gold -->
<!-- Budget remaining: $50.00 -->
Absolutely — here's how I approach the foundational architecture for the CSPM scanner, referencing Sage's PRD throughout.

---

# ADR-001: Monolith vs Microservices

## Context

Sage’s PRD (see: docs/prds/cspm-v1.md) defines a v1 CSPM scanner that must:

- Support multi-cloud (AWS, Azure, GCP) asset discovery and misconfiguration detection
- Provide compliance mapping and remediation guidance
- Integrate tightly with BrainstormMSP for auth, tenant management, and reporting
- Use Go, PostgreSQL (with pgvector), and run containerized (Kubernetes)

## Options

### Option A: Modular Monolith

- All core components (scanner, policy engine, remediation, API) in a single Go service
- Internal package/module boundaries, but one deployable artifact
- Exposes a single API endpoint (REST or gRPC) for BrainstormMSP integration

### Option B: Microservices

- Each major component (scanner, policy, remediation, API) as a separate Go service
- Communicate over gRPC or REST, each with its own deployment, scaling, and lifecycle
- Shared data store (PostgreSQL/pgvector)

## Trade-offs

| Criteria                  | Modular Monolith                         | Microservices                                 |
|---------------------------|------------------------------------------|-----------------------------------------------|
| **Deployment Complexity** | Simple: one service, one container       | Complex: multiple services, orchestration     |
| **Dev Velocity**          | Fast: easier local dev, fewer moving parts| Slower: more boilerplate, inter-service APIs  |
| **Scaling**               | Coarse-grained: scale whole app          | Fine-grained: scale bottlenecks independently |
| **Failure Isolation**     | Lower: one bug can affect all            | Higher: component crashes isolated            |
| **Team Size Fit**         | Small team: ideal                        | Needs larger team, more ops overhead          |
| **Extensibility**         | Good with clean interfaces               | Excellent, but at cost of complexity          |
| **Integration**           | Simple: one integration point            | More complex: orchestrate across services     |
| **Operational Overhead**  | Minimal                                  | Significant (monitoring, tracing, etc.)       |

## Recommendation

**Go with a Modular Monolith for v1.**

**Why:**  
- The PRD is clear: v1 is foundational, with a fixed ruleset, no real-time alerting, and no custom rules engine (see Non-Goals).
- Most features are tightly coupled: scan, evaluate, store, report.
- The team needs to move fast, and the operational complexity of microservices isn’t justified yet.
- We can still enforce module boundaries in code (package separation, clear interfaces) to enable future extraction if/when needed.

**What we’re giving up:**  
- Can’t independently scale scanner vs API vs remediation engine (but not a problem at v1 scale).
- Less failure isolation (a panic in the scanner can bring down the API), but with good testing and error handling, this risk is manageable.

**What we’re gaining:**  
- Simpler deployment, faster iteration, easier integration with BrainstormMSP.
- Lower cognitive and operational load for a small team.

---

# High-Level System Architecture (ASCII Diagram)

```ascii
+-------------------------------------------------------------+
|                BrainstormMSP Platform (external)            |
|  +-------------------------+                                |
|  |  MSP Operator Dashboard |                                |
|  +-------------------------+                                |
|             | (REST/gRPC API calls)                         |
+-------------|-----------------------------------------------+
              |
              v
+-------------------------------------------------------------+
|           CSPM Scanner Service (Modular Monolith)           |
|                                                             |
|  +----------------+      +----------------+                 |
|  |  API Layer     |<---->|  Auth Adapter  |<--+             |
|  +----------------+      +----------------+   |             |
|         |                                   |               |
|         v                                   |               |
|  +----------------+      +----------------+ |               |
|  | Scanner Engine |----->| Policy Engine  | |               |
|  +----------------+      +----------------+ |               |
|         |                        |           |              |
|         v                        v           |              |
|  +----------------+      +----------------+  |              |
|  | Data Store     |<---->| Remediation    |  |              |
|  | (Postgres +    |      | Engine         |  |              |
|  |  pgvector)     |      +----------------+  |              |
|  +----------------+                        |                |
+--------------------------------------------+----------------+
```

---

# Component Breakdown

## 1. Scanner Engine

- **Purpose:** Connects to AWS/Azure/GCP using read-only credentials, enumerates resources (per PRD: EC2, S3, IAM, etc.)
- **Responsibilities:** Handles all cloud SDK interactions, normalizes asset data into internal models.

## 2. Policy Engine

- **Purpose:** Applies fixed ruleset to discovered assets, detects misconfigurations (public buckets, open security groups, etc.)
- **Responsibilities:** Maps findings to compliance controls (CIS, SOC2, HIPAA), attaches control IDs and descriptions.

## 3. Remediation Engine

- **Purpose:** For each finding, generates step-by-step remediation guidance, links to vendor docs, and risk explanations.
- **Responsibilities:** Purely advisory in v1 (per PRD Non-Goals: no auto-remediation).

## 4. Data Store

- **Purpose:** Persist all assets, findings, compliance mappings, and evidence.
- **Tech:** PostgreSQL, with `pgvector` for semantic search/deduplication of findings.
- **Responsibilities:** Enforce encryption at rest, log all access for auditability.

## 5. API Layer

- **Purpose:** Exposes all functionality to BrainstormMSP (scan triggers, findings retrieval, report generation, evidence export).
- **Responsibilities:** Handles authentication/authorization via BrainstormMSP, manages multi-tenancy.

---

# Data Flow

```ascii
Cloud Provider Accounts
        |
        v
+-------------------+
|  Scanner Engine   |  <-- (fetches resources via cloud SDKs)
+-------------------+
        |
        v
+-------------------+
|  Policy Engine    |  <-- (evaluates rules, maps to compliance)
+-------------------+
        |
        v
+-------------------+
|  Findings Store   |  <-- (Postgres + pgvector)
+-------------------+
        |
        v
+-------------------+
|  Remediation      |  <-- (generates guidance)
+-------------------+
        |
        v
+-------------------+
|  API Layer        |  <-- (serves data to BrainstormMSP)
+-------------------+
        |
        v
BrainstormMSP Dashboard (User sees findings, reports, evidence)
```

---

# Integration Points with BrainstormMSP

- **Authentication & Authorization:** All API calls validated via BrainstormMSP (see PRD: Technical Constraints).
- **Tenant Management:** Each scan, finding, and report is associated with a tenant/account as defined in BrainstormMSP.
- **Scan Triggers:** BrainstormMSP can trigger scans (scheduled/on-demand) via API.
- **Findings/Reports Export:** BrainstormMSP fetches findings, compliance mappings, and evidence for dashboard/reporting.
- **Audit Logging:** All operations (scan, data access) logged for compliance and traceability, visible/auditable in BrainstormMSP.

---

# Technology Choices & Rationale

## Language: Go

- **Why:** Fast, strong concurrency model (great for scanning multiple accounts), robust cloud SDK support, aligns with PRD.
- **Disagree?** No — Go is the right fit for this workload.

## Database: PostgreSQL + pgvector

- **Why:** Mature RDBMS, native support for multi-tenancy patterns, strong ACID guarantees, easy to containerize. `pgvector` enables semantic search/deduplication for findings, as required by PRD.
- **Disagree?** No — fits requirements and future extensibility.

## API: REST vs gRPC

- **REST:** Simpler for initial integration, easier for BrainstormMSP frontend/backend to consume, more accessible for third-party integrations.
- **gRPC:** Higher performance, strong typing, but more complex to debug and less accessible for non-Go clients.

**Recommendation:**  
- Start with **REST** for v1 API, as the PRD emphasizes transparency, open integration, and reporting.  
- If/when we need high-throughput or internal service-to-service calls (future microservices), we can add gRPC endpoints behind the scenes.

---

# Notes on PRD Scope/Constraints

- **Agree:** Fixed ruleset, agentless scanning, no real-time alerting, no auto-remediation — all make sense for v1 and keep the system tractable.
- **Potential future tension:** If we add custom rules, real-time/event-driven scanning, or auto-remediation, we’ll need to revisit boundaries and possibly split into microservices. The monolith design allows for this evolution by enforcing clean module interfaces now.

---

# Summary

- **Modular monolith** for v1: faster, simpler, aligns with team size and scope.
- **Clear module boundaries**: scanner, policy, remediation, data, API.
- **REST API** for integration, PostgreSQL+pgvector for storage.
- **Tight integration** with BrainstormMSP for auth, tenancy, and reporting.
- **Design allows for future extraction** of services if/when complexity grows.

If anyone disagrees with the monolith-first approach, let’s draw the microservices diagram and compare trade-offs for our actual team and v1 goals. For now, this is the architecture that gets us shipping, fast, and safely.

— Quinn
