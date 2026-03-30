<!-- Agent: sage-pm | Model: gpt-4o-2024-11-20 | Cost: $0.0100 -->

# Policy Evaluation Engine Specification

## Purpose and Scope

The Policy Evaluation Engine is designed to evaluate discovered assets against a set of YAML-defined security rules. The engine will map findings to compliance frameworks (CIS, SOC 2, HIPAA) and deduplicate findings using `pgvector` embeddings to reduce noise and improve actionable insights. This feature is critical for ensuring that the Living Case Study MSP Security Stack can provide robust compliance reporting and actionable remediation guidance.

### Scope
- Evaluate assets discovered by the Asset Discovery module.
- Support YAML-based rule definitions for flexibility and extensibility.
- Map findings to compliance frameworks for audit readiness.
- Deduplicate findings to improve signal-to-noise ratio.

### Non-goals
- Real-time enforcement of security policies (this is handled by the Enforcement Engine).
- Rule creation or editing UI (handled in the Policy Management module).
- Support for non-YAML rule formats.

---

## Functional Requirements

1. **Rule Parsing and Evaluation**
   - The engine must parse YAML-defined security rules and evaluate them against discovered assets.
   - Rules must support conditions based on asset metadata (e.g., tags, configurations, compliance status).

2. **Compliance Mapping**
   - The engine must map each finding to one or more controls from CIS, SOC 2, or HIPAA frameworks.
   - Mapping must include control IDs and descriptions for audit purposes.

3. **Deduplication**
   - The engine must deduplicate findings by comparing their semantic similarity using `pgvector` embeddings.
   - Deduplication thresholds must be configurable (e.g., 0.85 similarity score).

4. **Output**
   - The engine must produce a JSON report of findings, including:
     - Asset ID
     - Violated rule(s)
     - Mapped compliance control(s)
     - Deduplication status (e.g., original or duplicate)
   - The report must be exportable via API.

5. **Error Handling**
   - The engine must log parsing errors for invalid YAML rules, including line numbers and error descriptions.
   - Invalid rules must not block evaluation of valid rules.

---

## Non-Functional Requirements

### Performance
- The engine must evaluate 10,000 assets against 1,000 rules within 5 minutes.
- Deduplication must complete within 10% of the total evaluation time.

### Security
- The engine must validate and sanitize all YAML inputs to prevent injection attacks.
- Access to compliance mappings and findings must be restricted to authorized users via role-based access control (RBAC).

---

## Acceptance Criteria

1. **Rule Evaluation**
   - Given a set of valid YAML rules and discovered assets, the engine evaluates and outputs findings matching the rules.
   - Invalid YAML rules are logged with error details, and valid rules are still processed.

2. **Compliance Mapping**
   - Findings include correct mappings to CIS, SOC 2, and HIPAA controls based on provided mapping data.

3. **Deduplication**
   - Findings with a semantic similarity score above the configured threshold are marked as duplicates in the output.

4. **Performance**
   - The engine processes 10,000 assets against 1,000 rules in under 5 minutes in a test environment.

5. **Security**
   - YAML inputs with malicious payloads are rejected, and no unauthorized access to findings or mappings is possible.

---

## Dependencies

1. **Asset Discovery Module**
   - Provides the list of discovered assets and their metadata for evaluation.

2. **Policy Management Module**
   - Supplies YAML-defined rules and compliance mapping data.

3. **PostgreSQL Database with `pgvector`**
   - Required for storing and querying embeddings for deduplication.

4. **Authentication and Authorization**
   - Ensures only authorized users can access the engine and its outputs.

---

## Out of Scope

- Real-time policy enforcement.
- Support for non-YAML rule formats (e.g., JSON or XML).
- Creation or editing of compliance mappings (assumed to be pre-defined).
- Advanced analytics or visualization of findings (handled by the Reporting module).
