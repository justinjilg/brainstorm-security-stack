<!-- Agent: sage-pm | Model: gpt-4.1-2025-04-14 | Cost: $0.0155 | Latency: 18455ms -->
<!-- Route: explicit | Quality: 0.86 | Reputation: gold -->
<!-- Budget remaining: $49.99 -->
# PRD: Living Case Study CSPM Scanner v1

## 1. Executive Summary

**What we're building:**  
A Cloud Security Posture Management (CSPM) scanner that automatically discovers cloud assets across AWS, Azure, and GCP, detects misconfigurations, maps findings to compliance frameworks (CIS Benchmarks, SOC2 CC6/CC7, HIPAA 164.312), and provides actionable remediation recommendations. This is the foundational security module for the Living Case Study MSP Security Stack.

**Why:**  
MSPs and their clients are under increasing pressure to secure complex, multi-cloud environments and demonstrate compliance. Existing solutions (Wiz, Orca, Prisma Cloud) are powerful but often expensive, opaque, and not tailored for MSP workflows. Our CSPM will be tightly integrated with BrainstormMSP, designed for transparency, extensibility, and operational efficiency.

---

## 2. Competitive Landscape

**Wiz:**  
- *Strengths:* Agentless, deep cloud inventory, risk prioritization, broad compliance coverage.  
- *Weaknesses:* High cost, limited MSP-specific workflows, closed platform.

**Orca Security:**  
- *Strengths:* Agentless, side-scanning, fast deployment, good compliance mapping.  
- *Weaknesses:* UI complexity, less customizable reporting, expensive.

**Prisma Cloud (Palo Alto):**  
- *Strengths:* Broad cloud support, integrates with Palo Alto ecosystem, strong compliance.  
- *Weaknesses:* Steep learning curve, less agile, not MSP-first.

**Our Differentiation:**  
- **MSP-first:** Multi-tenant by design, with delegated access and reporting.
- **Open integration:** Native integration with BrainstormMSP workflows and APIs.
- **Transparent mapping:** Findings directly mapped to compliance controls, with clear evidence paths.
- **Extensible architecture:** Built in Go, open API, and pluggable rules engine.

---

## 3. User Personas

**1. MSP Operator (Primary Persona)**
- Needs to onboard new client cloud accounts quickly, run baseline scans, and deliver compliance-ready reports.
- Prioritizes operational efficiency and multi-tenant management.

**2. Security Engineer**
- Needs granular misconfiguration data, remediation guidance, and integration with incident response workflows.
- Prioritizes actionable findings and API access.

**3. Compliance Officer**
- Needs evidence that cloud environments align with frameworks (CIS, SOC2, HIPAA).
- Prioritizes clear mapping, exportable reports, and audit trails.

---

## 4. Core Features for v1

### 1. Multi-Cloud Asset Discovery
- Enumerate resources in AWS (EC2, S3, IAM, RDS, Lambda), Azure (VMs, Storage Accounts, Key Vault, SQL DB), GCP (Compute Engine, Cloud Storage, IAM, Cloud SQL).

### 2. Misconfiguration Detection
- Run rulesets for:
  - Public S3 buckets / Storage Accounts / Cloud Storage buckets
  - Overly permissive IAM roles/policies
  - Unencrypted RDS/SQL DB/Cloud SQL instances
  - Open security groups/firewall rules
  - Disabled logging (CloudTrail, Azure Activity Log, GCP Audit Log)
  - Outdated Lambda/Function runtimes

### 3. Compliance Mapping
- Map each finding to:
  - **CIS Benchmarks** (AWS v1.4.0, Azure v1.3.0, GCP v1.3.0)
  - **SOC2 CC6/CC7**
  - **HIPAA 164.312**

### 4. Remediation Recommendations
- For each finding, provide:
  - Step-by-step remediation guidance (console/CLI)
  - Links to vendor docs
  - Risk explanation (why this matters)

### 5. Reporting & Evidence Export
- Generate per-tenant and per-account reports
- Export findings and evidence as PDF/CSV

---

## 5. Acceptance Criteria

**Asset Discovery**
- [ ] System can connect to AWS, Azure, and GCP accounts using read-only credentials/service principals.
- [ ] System enumerates at least the following resources:
  - AWS: EC2, S3, IAM, RDS, Lambda
  - Azure: Virtual Machines, Storage Accounts, Key Vault, SQL Database
  - GCP: Compute Engine, Cloud Storage, IAM, Cloud SQL

**Misconfiguration Detection**
- [ ] Detects public S3 buckets, Azure Storage Accounts, GCP Cloud Storage buckets.
- [ ] Flags IAM roles/policies with wildcard permissions or admin privileges.
- [ ] Detects unencrypted RDS/Azure SQL/Cloud SQL instances.
- [ ] Flags security groups/firewall rules open to 0.0.0.0/0 or ::/0.
- [ ] Detects if CloudTrail, Azure Activity Log, or GCP Audit Log is disabled.
- [ ] Flags Lambda/Function runtimes older than 12 months.

**Compliance Mapping**
- [ ] Each finding is mapped to at least one CIS, SOC2, or HIPAA control, with control ID and description.
- [ ] Reports include a compliance summary by framework.

**Remediation Recommendations**
- [ ] Each finding includes:
  - Step-by-step remediation (console/CLI)
  - Link to official documentation
  - Risk explanation

**Reporting**
- [ ] Users can generate and export findings as PDF and CSV.
- [ ] Reports are available per-tenant and per-cloud account.

**Integration**
- [ ] System authenticates and authorizes via BrainstormMSP.
- [ ] All data stored in PostgreSQL, findings vectorized in pgvector for similarity search.

---

## 6. Non-Goals (v1)

- **No agent-based scanning:** Only API/metadata-based (agentless) scanning in v1.
- **No real-time alerting:** Scans are scheduled/on-demand, not continuous or event-driven.
- **No auto-remediation:** Recommendations only; no automated fixes in v1.
- **No custom rules engine:** v1 ships with a fixed ruleset; custom rules are backlog.
- **No support for Alibaba Cloud, Oracle Cloud, or on-prem resources.**
- **No integrations with ticketing/IR tools (e.g., Jira, ServiceNow) in v1.**
- **No RBAC beyond MSP/operator roles.**
- **No mobile UI.**

---

## 7. Technical Constraints

- **Integration:** Must integrate with BrainstormMSP for authentication, authorization, and tenant management.
- **Language:** Go for all control plane and scanning logic.
- **Database:** PostgreSQL for all storage; findings indexed in pgvector for semantic search and deduplication.
- **Cloud SDKs:** Use official AWS SDK for Go v2, Azure SDK for Go, and GCP Go client libraries.
- **Security:** All credentials must be encrypted at rest (PostgreSQL) and in transit.
- **Deployment:** Must run as a containerized service (Docker), deployable via Kubernetes.
- **Auditability:** All scan operations and data access must be logged.

---

## 8. Success Metrics

- **Coverage:** ≥90% of CIS Benchmark Level 1 controls for AWS, Azure, GCP core services.
- **Accuracy:** ≤2% false positive rate on misconfiguration findings (validated with test accounts).
- **Performance:** Full scan of a 100-resource account completes in <10 minutes.
- **Adoption:** At least 3 MSPs onboard and run scans within 30 days of release.
- **Compliance Mapping:** 100% of findings mapped to at least one compliance control.
- **User Satisfaction:** ≥80% positive feedback from MSP operators in post-launch survey.
- **Export Reliability:** 100% successful report exports (PDF/CSV) in user acceptance testing.

---

**Next Steps:**  
- Review by Quinn (architecture), Casey (API security), and Sam (compliance).
- Finalize ruleset and compliance mappings.
- Begin technical design and prototyping.

---

*Sprint goal achieved when v1 scanner completes a full scan, generates a compliance-mapped report, and is integrated with BrainstormMSP for at least one multi-cloud tenant.*
