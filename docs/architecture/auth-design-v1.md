<!-- Agent: jordan-auth | Model: gpt-4.1-2025-04-14 | Cost: $0.0260 | Latency: 209076ms -->
<!-- Route: explicit | Quality: 0.84 | Reputation: gold -->
<!-- Budget remaining: $50.00 -->
Absolutely. Here’s ADR-002, written with my typical precision and referencing both Sage’s PRD and Quinn’s architecture.

---

# ADR-002: Authentication & Authorization Design

## Context

- **Sage’s PRD**: Multi-tenant, MSP-first CSPM scanner. Three personas: MSP Operator (primary), Security Engineer, Compliance Officer. Requires tight tenant isolation, delegated access, and integration with BrainstormMSP for auth and tenancy.
- **Quinn’s Architecture**: Modular monolith (Go), clear module boundaries (Scanner, Policy Engine, Remediation, API), all API access via BrainstormMSP, PostgreSQL for storage, REST API for integration.

This ADR defines the authentication and authorization model for the CSPM scanner, focusing on secure multi-tenancy, least privilege, and seamless integration with BrainstormMSP.

---

## 1. Multi-Tenant Isolation Model

**Goal:**  
Strictly isolate data and actions between MSPs and their clients. No cross-tenant data leakage, even in error states.

**Model:**  
- **Tenant**: Represents an MSP or a direct customer.
- **Sub-Tenant (Client Account)**: Each MSP manages multiple client environments (cloud accounts/subscriptions/projects).  
- **User**: Belongs to a tenant, has roles scoped to one or more sub-tenants.

**Implementation:**  
- Every asset, finding, and report is tagged with both `tenant_id` and `sub_tenant_id` in the database.
- All API endpoints require a valid tenant context; queries are always filtered by `tenant_id` and, where relevant, `sub_tenant_id`.
- **No global super-admins:** Even MSP operators must explicitly select/manage a client environment—no accidental access to all data.
- **Delegated access:** MSP operators can be granted scoped access to specific sub-tenants (client accounts).

**Flag:**  
Quinn’s modular monolith makes this tractable—single API layer enforces all tenancy boundaries. If we split into microservices later, tenancy context must be propagated and enforced at every boundary (potential for drift if not handled rigorously).

---

## 2. Authentication

### a. JWT Structure

- **Issuer:** BrainstormMSP (central IdP)
- **Format:** RFC 7519 (JWT)
- **Claims:**
  - `sub` (user id)
  - `tenant_id`
  - `sub_tenant_ids` (array of accessible client environments)
  - `roles` (array, e.g., `["MSP_OPERATOR", "SEC_ENGINEER"]`)
  - `permissions` (optional, for fine-grained overrides)
  - `iat`, `exp`, `jti`, `aud` (standard claims)

### b. Token Lifetimes

- **Access Token:** 15 minutes (short-lived, bearer)
- **Refresh Token:** 8 hours (rotatable, HttpOnly cookie for dashboard)
- **Rotation Strategy:**  
  - On every refresh, issue new refresh token with new `jti`.
  - Maintain a rolling window of valid refresh tokens (revoke old on use).
  - Revoke all tokens on password reset or explicit logout.

### c. Rotation & Revocation

- **Rotation:** Standard rotating refresh tokens (see above).
- **Revocation:**  
  - Token blacklist in Redis/Postgres for immediate revocation (e.g., on user disable, role change).
  - On every API call, check `jti` against blacklist (fast, in-memory cache).

---

## 3. Authorization

### a. RBAC vs ABAC

- **RBAC (Role-Based Access Control):**  
  - **Chosen for v1.**  
  - Simpler, auditable, matches Sage’s personas (Operator, Engineer, Compliance Officer).
  - Each role maps to a fixed set of permissions.
- **ABAC (Attribute-Based):**  
  - Not needed for v1. If we introduce custom rules, dynamic policies, or resource-level exceptions, revisit.

### b. Role Hierarchy

| Role               | Description                                         | Scope                |
|--------------------|-----------------------------------------------------|----------------------|
| MSP_OPERATOR       | Can manage onboarding, trigger scans, view all client findings/reports | Tenant + Sub-tenants |
| SECURITY_ENGINEER  | Can view findings, download evidence, see remediation guidance | Sub-tenant          |
| COMPLIANCE_OFFICER | Can view compliance mappings, export reports        | Sub-tenant          |

- Roles are **not** hierarchical—explicit assignment only.
- Users may hold multiple roles across different sub-tenants.

### c. Permission Matrix

| Permission                | MSP_OPERATOR | SECURITY_ENGINEER | COMPLIANCE_OFFICER |
|---------------------------|:------------:|:-----------------:|:------------------:|
| Onboard Cloud Account     |      X       |                   |                    |
| Trigger Scan              |      X       |         X         |                    |
| View Findings             |      X       |         X         |         X          |
| Download Evidence         |      X       |         X         |         X          |
| View Remediation Guidance |      X       |         X         |                    |
| Export Reports            |      X       |                   |         X          |
| Manage Users/Roles        |      X       |                   |                    |

- All permissions are **scoped** by `tenant_id` and `sub_tenant_id`.

**Flag:**  
If Sage’s personas expand (e.g., read-only auditors, client-side users), RBAC will need to be extended. For v1, this matrix is sufficient.

---

## 4. API Authentication for Cloud Provider Integrations

**Principle:**  
Never store long-lived credentials. Use least-privilege, short-lived, auditable access methods.

### a. AWS: AssumeRole

- **Mechanism:**  
  - Each client account creates a dedicated IAM Role with a trust policy for our scanner’s AWS account.
  - Scanner assumes role via STS (`AssumeRole` API), receives temporary credentials (max 1 hour).
  - Role is limited to read-only actions required for discovery (per PRD).
- **Rotation:**  
  - No static keys stored; credentials rotate on every scan.

### b. Azure: Service Principal

- **Mechanism:**  
  - Each client registers a Service Principal (App Registration) with least-privilege role.
  - Our system stores encrypted client ID/secret/tenant ID.
  - Tokens acquired via OAuth2 client credentials flow, valid for 1 hour.
- **Rotation:**  
  - Recommend regular secret rotation; support re-upload in UI.

### c. GCP: Service Account

- **Mechanism:**  
  - Each client creates a Service Account with read-only IAM roles.
  - Our system stores encrypted service account key (JSON).
  - Tokens acquired via JWT/OAuth2, valid for 1 hour.
- **Rotation:**  
  - Recommend key rotation; support re-upload in UI.

**Security:**  
- All credentials are encrypted at rest (Postgres).
- Credentials decrypted only in scanner process memory, never logged.
- Audit log every use of cloud credentials.

---

## 5. Session Management for the Dashboard

- **Frontend (Dashboard):**
  - Uses short-lived access tokens (JWT, 15 min) and rotating refresh tokens (8 hr, HttpOnly cookie).
  - On token expiry, silent refresh if refresh token is valid.
  - On logout or token theft, all tokens revoked (see above).
- **Concurrent Sessions:**
  - Allow multiple sessions per user (e.g., different browsers/devices).
  - Each session has unique `jti`; revocation can be per-session or global.

- **Device Binding (optional for v1):**
  - Not required, but recommend tracking user agent/IP for session anomaly detection.

---

## 6. Inter-Service Authentication (Internal Module Boundaries)

**Current State:**  
- Quinn’s monolith: all modules in-process, no network boundaries.
- All authz enforced at API layer—no risk of bypass.

**Future-Proofing:**  
- If/when modules are split into microservices:
  - Use mTLS between services.
  - Issue internal service tokens (JWT with `aud=internal`, signed by platform CA).
  - Propagate user/tenant context via signed JWT in request headers.
  - Each service validates both service identity and user context before processing.

**Flag:**  
No immediate auth challenges in monolith, but if Scanner/Policy/Remediation are split, tenancy and role context must be strictly enforced at every hop. Recommend designing internal APIs to always require explicit context, even if not strictly necessary in v1.

---

## Summary Table

| Concern                        | Approach                                                        |
|---------------------------------|-----------------------------------------------------------------|
| Multi-tenant isolation          | tenant_id/sub_tenant_id tagging, API-level enforcement          |
| Authentication                  | JWT (BrainstormMSP-issued), short-lived, rotating tokens        |
| Authorization                   | RBAC, explicit role-permission matrix, scoped by tenant/account |
| Cloud provider API integration  | AssumeRole (AWS), Service Principal (Azure), Service Account (GCP), all least-privilege, short-lived |
| Dashboard session management    | Access/refresh tokens, session revocation, concurrent sessions  |
| Inter-service authentication    | In-process for v1; mTLS + JWT propagation if/when split         |

---

## Final Notes

- Quinn’s component boundaries do **not** create auth challenges in v1. The monolith ensures all access is mediated by a single API layer.
- Sage’s personas are fully supported by the RBAC model and permission matrix. If new personas or finer-grained controls are needed, ABAC or permission overrides can be introduced in v2.
- All decisions maximize least privilege and auditability, with extensibility for future scale.

— Jordan
