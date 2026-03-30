<!-- Agent: casey-apisec | Model: gpt-4.1-2025-04-14 | Cost: $0.0331 | Latency: 110704ms -->
<!-- Route: explicit | Quality: 0.73 | Reputation: gold -->
<!-- Budget remaining: $49.96 -->
Absolutely. Here’s my security review of the two code artifacts—**the authentication handler (`src/auth/handler.go`)** and **the AWS scanner module (`src/scanner/providers/aws.go`)**—with a focus on:

- Adherence to [API Security Requirements](docs/security/api-security-requirements-v1.md)
- Input validation
- Threat model coverage ([River’s threat model](docs/security/threat-model-v1.md))
- Recommendations for improvement

---

## 1. Authentication Handler (`src/auth/handler.go`)

### **Adherence to API Security Requirements**

**Strengths:**
- **JWT Signing:** Uses ECDSA P-256 (ES256), as required (no HMAC, no symmetric keys).
- **Claims:** All required claims present: `tenant_id`, `sub_tenant_ids`, `roles`, `permissions`, and standard JWT claims.
- **Issuer/Audience:** Both enforced at issuance and verification. This closes the “aud claim not checked” gap I called out in the requirements.
- **Input Validation:**  
  - Strict checks on `user_id`, `tenant_id`, `sub_tenant_ids`, and `roles`.
  - Validates allowed roles explicitly (`MSP_OPERATOR`, `SEC_ENGINEER`, `COMPLIANCE_OFFICER`).
  - Rejects malformed JSON and unknown fields.
- **Error Handling:**  
  - Never leaks internals. Returns generic error codes/messages in JSON.
  - No stack traces, DB errors, or internal details in responses.
- **No Logging of Secrets:**  
  - No sensitive data is logged or returned in errors.

**Gaps/Opportunities:**
- **Key Management:**  
  - In-memory keys are fine for demo, but the code and comments correctly call out the need for HSM/KMS integration in production.
- **Token Revocation:**  
  - No refresh token rotation or revocation list implemented yet. This is noted as a TODO, but it’s a real risk if not addressed before production (see “Threat Model Coverage” below).
- **Rate Limiting:**  
  - Not present in this handler. Per requirements, rate limiting (especially on token issuance endpoints) is a must-have to prevent brute force and DoS.
- **Audit Logging:**  
  - Not present. Security events (failed logins, token issuance, etc.) should be logged (without sensitive data) for forensic and abuse-tracking purposes.
- **Context Handling:**  
  - The `WithAuthClaims` function takes an `interface{}` for context, which is unidiomatic in Go and could lead to bugs. Should accept/return `context.Context` directly.

### **Input Validation**

- **Strict:** All fields are checked for type, length, and allowed values.
- **Fail-Closed:** Any deviation (unknown field, bad type, etc.) results in a 400 with a generic error.
- **No Mass Assignment:** Only whitelisted fields are accepted; extra fields are rejected.

### **Threat Model Coverage**

- **Authentication Bypass/Token Forgery:**  
  - Strong signature validation and claim checks. No unsigned tokens accepted.
- **Multi-Tenant Isolation:**  
  - Tenant and sub-tenant IDs are included in JWT claims, enabling downstream enforcement.
- **Excessive Permissions:**  
  - Only known roles allowed; no “super-admin” or privilege escalation path.
- **Sensitive Data in Errors:**  
  - No leakage.
- **Replay Attacks:**  
  - No explicit refresh token rotation/revocation yet (see below).

---

## 2. AWS Scanner Implementation (`src/scanner/providers/aws.go`)

### **Adherence to API Security Requirements**

**Strengths:**
- **Credential Handling:**  
  - Uses provided AWS credentials; does not log secrets or credentials at any point.
- **Error Handling:**  
  - Defensive: errors from AWS APIs are wrapped, not leaked to logs or outputs.
- **No Persistence:**  
  - Scanner returns data as Go structs; all persistence is handled elsewhere, reducing risk of accidental data exposure or injection.
- **Extensible & Modular:**  
  - No hard-coded tenant/account logic; expects orchestration layer to enforce tenancy and authorization.

**Gaps/Opportunities:**
- **Input Validation:**  
  - This module assumes it receives valid, authorized AWS config objects. It does not validate input at the API boundary (that’s the orchestrator’s job), but this should be documented clearly.
- **Error Propagation:**  
  - Errors are returned to the caller. If the orchestrator logs or exposes these errors without filtering, there’s a risk of leaking AWS error details upstream.
- **No Rate Limiting:**  
  - If exposed via an API endpoint, rate limiting must be enforced at the API layer to prevent abuse.

### **Input Validation**

- **N/A at this Layer:**  
  - The scanner is an internal module, not an API boundary. Input validation (e.g., tenant/account checks) must be enforced by the orchestrator before invoking the scanner.

### **Threat Model Coverage**

- **Credential Leakage:**  
  - No credentials are logged or returned.
- **Privilege Escalation:**  
  - Scanner only uses provided credentials; no attempt to escalate or enumerate outside the assigned AWS account.
- **Resource Exhaustion:**  
  - No internal rate limiting or concurrency controls. If the orchestrator triggers many scans in parallel, could hit AWS API rate limits or exhaust resources.
- **Error Handling:**  
  - Defensive, but relies on the orchestrator to avoid leaking error details to end users.

---

## 3. Summary Table

| Requirement / Threat           | Auth Handler | AWS Scanner | Notes/Recommendations                               |
|-------------------------------|--------------|-------------|-----------------------------------------------------|
| JWT Signature & Claims         | ✅           | N/A         | ECDSA, strict claims, aud/iss enforced              |
| Input Validation               | ✅           | N/A         | Strict in handler; scanner expects orchestrator      |
| Error Response Hygiene         | ✅           | N/A         | No leakage; scanner returns errors to caller        |
| Rate Limiting                  | ❌           | N/A         | Must add to token endpoints, orchestrator for scans  |
| Tenant Isolation               | ✅           | N/A         | Claims support; orchestrator must enforce           |
| Revocation/Rotation            | 🚧           | N/A         | Needs implementation for refresh tokens             |
| Logging Hygiene                | ✅           | ✅           | No secrets logged                                   |
| Privilege Escalation           | ✅           | ✅           | Roles locked; scanner uses caller’s creds           |
| Resource Exhaustion            | N/A          | ❌           | Scanner needs orchestrator to control concurrency   |
| Mass Assignment                | ✅           | N/A         | Extra fields rejected                               |
| Threat Model Coverage          | ✅           | ✅           | All major risks addressed; see minor gaps           |

---

## 4. Recommendations

### **For the Authentication Handler**
1. **Implement Rate Limiting:**  
   - Add per-tenant and per-endpoint rate limiting (see requirements: 100/min default, stricter for sensitive endpoints).
2. **Token Revocation:**  
   - Implement refresh token rotation and revocation (e.g., Redis-backed blacklist). Enforce revocation on every request.
3. **Audit Logging:**  
   - Log security-relevant events (without sensitive data) for monitoring and forensics.
4. **Context Handling:**  
   - Refactor `WithAuthClaims` to use `context.Context` directly.
5. **Production Key Management:**  
   - Integrate with HSM/KMS for key storage and rotation before production.

### **For the AWS Scanner**
1. **Document Trust Boundaries:**  
   - Make it explicit in code/docs that input validation and authorization are the orchestrator’s responsibility.
2. **Error Handling:**  
   - Ensure orchestrator never exposes raw AWS errors to end users; always sanitize before returning.
3. **Concurrency Controls:**  
   - Orchestrator should limit concurrent scans per tenant/account to prevent resource exhaustion and AWS throttling.
4. **Unit Tests:**  
   - Add tests using AWS SDK stubs/mocks to verify error handling and edge cases.

### **For the Orchestrator/API Layer**
- **Strict Input Validation:**  
  - Enforce all input validation rules before invoking the scanner.
- **Enforce Tenant Isolation:**  
  - Never allow cross-tenant/account access.
- **Rate Limiting:**  
  - Apply per-tenant and per-endpoint limits as specified.
- **Error Response Standards:**  
  - Always return generic error messages, never raw errors from scanner or AWS SDK.

---

## 5. Conclusion

**Authentication handler** is robust and aligns well with the requirements and threat model. Minor improvements are needed around rate limiting, token revocation, and audit logging.

**AWS scanner** is secure by default, but relies on the orchestrator to enforce input validation, tenant isolation, and error hygiene. This is acceptable given the modular monolith architecture, but must be documented and enforced at the API boundary.

**No critical vulnerabilities found** in either artifact. The major risks are operational (rate limiting, revocation, error propagation) and can be closed with the above recommendations.

**If anyone disagrees, show me the curl command that breaks it. Otherwise, this is a solid security baseline for v1.**
