<!-- Agent: avery-frontend | Model: gpt-4.1-2025-04-14 | Cost: $0.0316 | Latency: 122662ms -->
<!-- Route: explicit | Quality: 0.88 | Reputation: gold -->
<!-- Budget remaining: $50.00 -->
Absolutely — here's my take, with a focus on actionable, high-density UI that gets MSP operators to the “what matters” in under 10 seconds. I’ll reference Sage’s personas, Quinn’s modular monolith, and River’s risk priorities throughout.

---

## 1. Primary Navigation Structure

MSP operators need to rapidly orient across tenants, see posture at a glance, and dive into findings. The nav must be flat, fast, and multi-tenant aware.

**Top-Level Nav:**
- **[Client Selector]** (always visible, left/top)
- **Overview** (CSPM summary, compliance scorecard, critical alerts)
- **Findings** (detailed misconfigurations, filters, search)
- **Compliance** (scorecards, evidence export)
- **Alert Timeline** (real-time/high-severity event stream)
- **Reports** (PDF/CSV exports, scan history)
- **Settings** (account, integrations — less prominent)

**Why?**
- “Overview” is the 10-second posture check.
- “Findings” is the actionable queue.
- “Compliance” is for audit/reporting (compliance officer crossover).
- “Alert Timeline” is for urgent, time-ordered triage.
- “Reports” and “Settings” are secondary.

---

## 2. CSPM Overview Screen (First View After Login)

**Goal:** Operator lands here and instantly sees:
- Overall risk posture (by severity)
- Compliance at a glance (SOC2/HIPAA/CIS)
- Top critical findings
- Tenant/account context

**ASCII Wireframe:**

```
+-----------------------------------------------------------------------------------+
| [Client Selector: ▼ ACME Corp]     [Switch Client]                                |
+-----------------------------------------------------------------------------------+
| [Last Scan: 3m ago]      [Scan Now]         [Export Report]                       |
+-----------------------------------------------------------------------------------+
| Risk Posture              Compliance Scorecard           Critical Alerts           |
| +---------------------+   +------------------------+    +---------------------+   |
| | 🔴 Critical:   3    |   | SOC2:     78% [↓2%]   |    | 1. S3 bucket public |   |
| | 🟠 High:      7    |   | HIPAA:    82% [↑1%]   |    | 2. Open SG: 0.0.0.0 |   |
| | 🟡 Medium:   12    |   | CIS:      91% [=]     |    | 3. Unencrypted RDS  |   |
| | 🟢 Low:      21    |   +------------------------+    +---------------------+   |
| +---------------------+                                                          |
+-----------------------------------------------------------------------------------+
| Asset Inventory Summary:                                                          |
|  AWS: 43 resources | Azure: 18 resources | GCP: 12 resources                      |
+-----------------------------------------------------------------------------------+
| [View All Findings]   [View Compliance Details]   [Go to Alert Timeline]          |
+-----------------------------------------------------------------------------------+
```

**Notes:**
- Severity-coded, compact, and actionable.
- Compliance deltas (trend arrows) for instant trajectory.
- Top critical alerts are clickable, linking to details.
- Asset inventory for context.

---

## 3. Findings View

**Goal:** Triage queue — filter, sort, and act on misconfigurations. Severity, resource, remediation, and compliance mapping are all visible.

**ASCII Wireframe:**

```
+-----------------------------------------------------------------------------------+
| [Client: ACME Corp]    [Filter: Severity ▼] [Cloud ▼] [Resource Type ▼] [Search]  |
+-----------------------------------------------------------------------------------+
| Severity | Resource         | Issue                      | Compliance | Actions    |
|----------|------------------|----------------------------|------------|-----------|
| 🔴Critical| S3: prod-data   | Public bucket              | SOC2-CC7   | [Remediate]|
| 🟠High   | EC2: web-01     | Open SG: 0.0.0.0/0         | CIS 4.1    | [Remediate]|
| 🟡Medium | RDS: db-02      | Unencrypted instance        | HIPAA      | [Remediate]|
| 🟢Low    | Lambda: old-fn  | Outdated runtime            | CIS 2.3    | [Remediate]|
+-----------------------------------------------------------------------------------+
| [Bulk Actions ▼]  [Export CSV]  [Show: 25 ▼]  [Page 1/4]                          |
+-----------------------------------------------------------------------------------+
| *Clicking a row expands details:                                                  |
|   - Resource metadata (ARN, tags)                                                 |
|   - Remediation steps (console/CLI)                                               |
|   - Risk explanation                                                              |
|   - Link to vendor docs                                                           |
+-----------------------------------------------------------------------------------+
```

**Notes:**
- Severity-coded left border for scanability.
- Compliance mapped inline.
- Remediation is always one click away.
- Bulk actions for MSP efficiency.

---

## 4. Compliance Scorecard View

**Goal:** At-a-glance posture by framework, exportable for client/auditor review.

**ASCII Wireframe:**

```
+-----------------------------------------------------------------------------------+
| [Client: ACME Corp]   [Framework: SOC2 ▼]  [Export PDF]  [Export CSV]             |
+-----------------------------------------------------------------------------------+
| SOC2 Compliance Score: 78% [↓2%]                                                  |
+-----------------------------------------------------------------------------------+
| Control         | Status   | Failing Findings | Evidence |                        |
|-----------------|----------|------------------|----------|------------------------|
| CC6.1           | ✅ Pass  | 0                | [View]   |                        |
| CC6.2           | ❌ Fail  | 2                | [View]   |                        |
| CC7.1           | ⚠️ Partial| 1               | [View]   |                        |
| ...             | ...      | ...              | ...      |                        |
+-----------------------------------------------------------------------------------+
| [Switch Framework: HIPAA | CIS]                                                   |
+-----------------------------------------------------------------------------------+
| *Clicking [View] shows:                                                            |
|   - Linked findings                                                                |
|   - Evidence artifacts (screenshots, config dumps)                                 |
|   - Remediation guidance                                                           |
+-----------------------------------------------------------------------------------+
```

**Notes:**
- Framework switcher is prominent.
- Status icons for instant scan.
- Evidence is one click away for audit prep.

---

## 5. Alert Timeline

**Goal:** Real-time, chronological stream of critical findings and operator actions.

**ASCII Wireframe:**

```
+-----------------------------------------------------------------------------------+
| [Client: ACME Corp]   [Filter: Severity=Critical]  [Pause/Resume]                 |
+-----------------------------------------------------------------------------------+
| Time        | Event Type    | Description                    | Actions             |
|-------------|--------------|---------------------------------|---------------------|
| 09:41:22    | Finding      | S3 bucket 'prod-data' public    | [Acknowledge] [Go→] |
| 09:40:15    | Operator     | Scan triggered by user 'jane'   |                     |
| 09:39:58    | Finding      | EC2 'web-01' open to 0.0.0.0/0  | [Acknowledge] [Go→] |
| ...         | ...          | ...                             | ...                 |
+-----------------------------------------------------------------------------------+
| [Show: 50 ▼]  [Jump to Now]                                                      |
+-----------------------------------------------------------------------------------+
```

**Notes:**
- Only critical/high findings by default (River’s risk: critical gets max surface).
- Operator actions (acknowledge, remediate) are visible for audit.
- Real-time stream — updates live.

---

## 6. Multi-Tenant Navigation

**Goal:** MSPs switch between clients instantly, always aware of context.

**Pattern:**
- Persistent client selector at the top left (or as a sidebar dropdown).
- Searchable, with recent clients pinned.
- All dashboard views scoped to selected client.

**ASCII:**

```
+------------------------------+
| [ACME Corp ▼]                |
|   - Beta Ltd                 |
|   - Zeta Inc                 |
|   - [Search…]                |
+------------------------------+
| (All screens update on select)|
+------------------------------+
```

---

## 7. Component Data Requirements (API Endpoints & Data Shapes)

**A. Overview Screen**
- `/api/clients/{client_id}/summary`
  - Returns: 
    - `last_scan_at`
    - `risk_counts` (critical/high/medium/low)
    - `top_findings` (id, severity, resource, issue)
    - `compliance_scores` (SOC2, HIPAA, CIS, % and delta)
    - `asset_inventory` (by cloud/provider)
- **Backend gap:** If compliance trend (delta vs last scan) isn’t available, backend needs to compute/store historical scores.

**B. Findings View**
- `/api/clients/{client_id}/findings?severity=&resource_type=&search=`
  - Returns paginated:
    - `id`
    - `severity`
    - `resource` (type, name, cloud, metadata)
    - `issue`
    - `compliance_mapping` (framework, control_id)
    - `remediation` (steps, docs, risk)
    - `status` (open, acknowledged, resolved)
- **Backend gap:** Need bulk update endpoint for mass actions.

**C. Compliance Scorecard**
- `/api/clients/{client_id}/compliance/{framework}`
  - Returns:
    - `score` (%)
    - `controls`: list of
      - `control_id`
      - `status` (pass/fail/partial)
      - `failing_findings` (ids)
      - `evidence` (links/attachments)
- `/api/clients/{client_id}/evidence/{finding_id}`
  - Returns: evidence artifacts for a finding.

**D. Alert Timeline**
- `/api/clients/{client_id}/timeline?severity=critical`
  - Returns:
    - `timestamp`
    - `event_type` (finding/operator)
    - `description`
    - `finding_id` (if applicable)
    - `operator_id` (if applicable)
- **Backend gap:** Need event stream or polling endpoint for real-time updates.

**E. Multi-Tenant Navigation**
- `/api/clients`
  - Returns: list of clients MSP manages (id, name, recent activity).

**F. Reports**
- `/api/clients/{client_id}/reports`
  - Returns: list of reports (scan time, type, download links).

---

## Backend Gaps (Flagged for Quinn)

- **Compliance trend deltas**: Need historical compliance scores for trend arrows.
- **Bulk findings update**: For mass acknowledge/remediate actions.
- **Event stream for alert timeline**: Real-time or near-real-time endpoint.
- **Evidence artifacts**: API for uploading/attaching evidence to findings.

---

## Summary

- **Primary nav**: Flat, fast, multi-tenant aware.
- **Overview**: Risk posture, compliance, critical findings — all above the fold.
- **Findings**: Dense, severity-coded, actionable with remediation at hand.
- **Compliance**: Scorecards, control-level drilldown, evidence export.
- **Alert timeline**: Real-time, critical-first, operator actions included.
- **Multi-tenant**: Persistent, searchable client selector.
- **APIs**: Mostly covered by Quinn’s monolith, but flagged gaps for compliance trends, bulk actions, event streaming, and evidence handling.

If anyone wants to see two alternative layouts side by side (e.g., sidebar vs topbar nav, card vs table for findings), I’ll mock them both up before arguing for one. That’s how we get to the best dashboard.

— Avery
