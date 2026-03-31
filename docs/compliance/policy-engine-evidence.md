<!-- Agent: sam-compliance | Model: gemini-2.5-flash | Cost: $0.0133 -->

## Compliance Mapping for Policy Evaluation Engine

### SOC 2 Type II (Trust Services Criteria)

**Control ID:** CC6.1 - Logical and Physical Access Controls: The entity implements logical access security measures to protect its information from unauthorized access.
*   **Evidence:**
    *   `src/policy/engine.go`, `Evaluate`: Orchestrates the evaluation of discovered assets against defined security rules. If rules are configured to check for logical access control misconfigurations, this function triggers their assessment.
    *   `src/policy/engine.go`, `evaluateRule`: Evaluates an individual rule against an asset. This function determines if an asset's configuration (which could include logical access settings) violates a defined security policy.
    *   `src/policy
