<!-- Agent: casey-apisec | Model: gpt-4.1-2025-04-14 | Cost: $0.0390 | Latency: 122979ms -->
<!-- Route: explicit | Quality: 0.76 | Reputation: gold -->
<!-- Budget remaining: $50.00 -->
Alright, Casey here. I’ve reviewed Quinn’s system architecture, Jordan’s authentication/authorization ADR, and River’s threat model. Here’s the API security requirements for the CSPM Scanner v1, with blunt, actionable rules and direct references to the upstream work. If I see a gap, I’ll show you the request that proves it.

---

# 1. Input Validation Rules (Per Endpoint Category)

**General Principle:**  
Every API endpoint is a potential injection vector. Validate everything at the boundary. Fail closed.

## a. Scan Triggers (`POST /scans`, `POST /scans/:account_id/trigger`)
- **Allowed:** Only authenticated, authorized users (see Jordan’s RBAC matrix) can trigger scans.
- **Input fields:**  
  - `account_id` (UUID, must exist in DB, must belong to tenant/sub-tenant in JWT)
  - `scan_type` (enum: `["full", "incremental"]`)
- **Validation:**
  - Reject any request with missing/extra fields.
  - Reject if `account_id` is not a valid UUID (no regex fudge, use a UUID parser).
  - Reject if `scan_type` is not in the allowed enum.
  - Reject if `account_id` does not belong to the JWT’s `tenant_id`/`sub_tenant_ids`.
- **Example of a blocked injection:**  
  ```bash
  curl -X POST /scans -H "Authorization: Bearer ..." -d '{"account_id": "1; DROP TABLE findings; --", "scan_type": "full"}'
  ```
  This must 400 with a validation error, not a 500.

## b. Policy CRUD (`GET/PUT /policies`, `POST /policies`, `DELETE /policies/:id`)
- **Note:** v1 has a fixed ruleset (per PRD), so policy CRUD is likely disabled. If enabled in the future:
  - **Name/Description:** 255 chars max, UTF-8, no control chars, strip HTML.
  - **Rules:** Only allow known rule types, validate structure with JSON Schema.
  - **ID fields:** UUID only, must belong to tenant.
  - **Reject:** Any attempt to POST/PUT with unknown fields, invalid types, or cross-tenant IDs.

## c. Findings Queries (`GET /findings`, `GET /findings/:id`, `GET /reports`)
- **Allowed query params:**  
  - `account_id`, `status`, `severity`, `compliance_control`, `limit`, `offset`
- **Validation:**
  - `account_id`: UUID, must belong to tenant/sub-tenant
  - `status`: enum (`["open", "closed", "suppressed"]`)
  - `severity`: enum (`["low", "medium", "high", "critical"]`)
  - `compliance_control`: string, max 32 chars, alphanumeric/underscore only
  - `limit`: integer 1-100, `offset`: integer >=0
- **Reject:** Any query with unknown params, invalid values, or tenant mismatch.
- **No direct SQL in any user input.** All DB queries must use parameterized statements.

---

# 2. Rate Limiting Strategy

**Principle:**  
Rate limiting is a security control, not just for DoS. Prevent brute force, enumeration, and abuse.

## a. Per-Tenant Limits
- **Default:** 100 requests/minute per tenant (across all endpoints)
- **Scan triggers:** Max 5 concurrent scans per tenant, max 20 triggers/hour
- **Findings queries:** 60/minute per tenant, burst up to 120 (with 429 on overflow)
- **Policy CRUD:** 10/minute per tenant, burst up to 20

## b. Per-Endpoint Limits
- **Sensitive endpoints** (scan triggers, policy changes): stricter (see above)
- **Read-only endpoints** (findings/reports): higher, but still capped

## c. Burst Handling
- Use token bucket algorithm (e.g., 60/minute with burst to 120)
- On exceeding, return HTTP 429 with `Retry-After` header

## d. Per-User/Session Limits (optional for v1)
- If abuse is detected from a single user, throttle at JWT `sub` level

---

# 3. Error Response Standards

**Principle:**  
Never leak internal details. Errors must be actionable but generic.

- **400 Bad Request:** Input validation failed (never echo raw input in response)
- **401 Unauthorized:** Invalid/missing token (never specify which)
- **403 Forbidden:** Authenticated but not authorized (never specify which permission failed)
- **404 Not Found:** Resource not found or not owned by tenant (never reveal existence of other tenants’ resources)
- **429 Too Many Requests:** Rate limit exceeded, include `Retry-After`
- **500 Internal Server Error:** Only if truly unexpected; log full stack trace internally, but respond with generic message

**Error Body Example:**
```json
{
  "error": "invalid_request",
  "message": "Invalid scan_type. Must be one of: full, incremental."
}
```
**Never include:** stack traces, DB errors, internal IDs, or implementation details.

---

# 4. API Versioning Strategy

- **Prefix all endpoints with `/v1/`** (e.g., `/v1/scans`)
- **No version in headers or query params** (too easy to get wrong)
- **Deprecate old versions with clear error (`410 Gone`) and migration guidance**
- **Document breaking changes in changelog and API docs**

---

# 5. Webhook Security

If any outbound webhooks are implemented (e.g., scan completion notifications):

- **HMAC signing:**  
  - Every webhook POST includes an `X-Signature` header: `HMAC-SHA256(secret, body)`
  - Each tenant gets a unique webhook secret (rotateable)
- **Replay protection:**  
  - Include `X-Timestamp` header (epoch ms)
  - Receiver must reject requests older than 5 minutes
  - Optionally include a nonce in body or header, and require idempotency
- **Verification example:**
  ```go
  expected := HMAC_SHA256(secret, body + timestamp)
  if req.Header["X-Signature"] != expected { reject }
  if now - req.Header["X-Timestamp"] > 5min { reject }
  ```
- **No unauthenticated webhooks.** All must be signed.

---

# 6. CORS and CSP Policy

- **CORS:**  
  - Only allow requests from the BrainstormMSP dashboard origin(s)
  - No wildcard origins (`*`)
  - Only allow required methods (`GET, POST, PUT, DELETE`)
  - Credentials (`Authorization` header) only allowed for trusted origins
- **CSP (if serving any UI):**
  - Default: `default-src 'none'; connect-src 'self' https://brainstormmsp.com;`
  - No inline scripts/styles, no third-party domains

---

# 7. Responses to River’s Threat Model Findings

River, your threat model flagged several high-risk areas. Here’s how the API layer mitigates each:

## a. **Authentication Bypass / Token Forgery**
- **Mitigation:**  
  - All endpoints require JWT from BrainstormMSP, validated for signature, issuer, audience, and expiration.
  - No endpoint accepts unsigned or expired tokens.
  - **Test:**  
    ```bash
    curl -X GET /v1/findings -H "Authorization: Bearer invalid.jwt.token"
    ```
    Should always 401.

## b. **Multi-Tenant Data Leakage**
- **Mitigation:**  
  - All queries filtered by `tenant_id` and `sub_tenant_id` from JWT.
  - Never return 404 vs 403 to distinguish between “not found” and “not yours.”
  - **Test:**  
    ```bash
    curl -X GET /v1/findings/other-tenants-id -H "Authorization: Bearer valid-token-for-tenant-A"
    ```
    Always 404, never reveals existence of other tenant’s data.

## c. **Excessive Permissions / Privilege Escalation**
- **Mitigation:**  
  - RBAC enforced at API layer per Jordan’s matrix. No “super-admin” endpoints.
  - No ability to modify roles/permissions via public API in v1.
  - **Test:**  
    ```bash
    # Attempt to trigger scan for a sub-tenant not in JWT
    curl -X POST /v1/scans -H "Authorization: Bearer ..." -d '{"account_id": "not-in-your-sub_tenant_ids"}'
    ```
    Always 403.

## d. **Rate Limiting Bypass / DoS**
- **Mitigation:**  
  - Per-tenant and per-endpoint rate limiting as above.
  - All 429s logged with tenant/user for abuse tracking.
  - **Test:**  
    ```bash
    # Flood with 1000 requests in a minute
    for i in {1..1000}; do curl -X GET /v1/findings -H "Authorization: Bearer ..."; done
    ```
    Only 100 succeed, rest get 429.

## e. **Sensitive Data Exposure in Errors**
- **Mitigation:**  
  - All error responses are generic, never leak stack trace, SQL, or internal IDs.
  - **Test:**  
    ```bash
    # Malformed request
    curl -X POST /v1/scans -H "Authorization: Bearer ..." -d '{"scan_type": "exploit"}'
    ```
    400 with generic error, no backend details.

## f. **Credential Leakage via Logs**
- **Mitigation:**  
  - API never logs Authorization headers or request bodies containing secrets.
  - All logs scrubbed before persistence.
  - **Test:**  
    - Review logs after failed auth attempts; no tokens or secrets should appear.

## g. **Replay Attacks (Webhooks)**
- **Mitigation:**  
  - HMAC signing and timestamp/nonce as described above.

## h. **Enumeration Attacks**
- **Mitigation:**  
  - All “not found” and “not authorized” responses are indistinguishable.
  - No endpoint leaks resource existence via timing or error detail.

## i. **Input Injection (SQL, Path, JSON)**
- **Mitigation:**  
  - All user input validated/parsed as above.
  - All DB access via parameterized queries, never string concatenation.

---

# 8. Additional API-Specific Risks Not Flagged by River

## a. **Mass Assignment**
- **Mitigation:**  
  - Only allow explicitly whitelisted fields in all POST/PUT bodies.
  - Ignore/drop any extra fields.
  - **Test:**  
    ```bash
    curl -X POST /v1/scans -H "Authorization: Bearer ..." -d '{"account_id": "...", "scan_type": "full", "is_admin": true}'
    ```
    `is_admin` is ignored, not set.

## b. **Improper Content-Type Handling**
- **Mitigation:**  
  - Only accept `application/json`. Reject all others with 415.
  - **Test:**  
    ```bash
    curl -X POST /v1/scans -H "Authorization: Bearer ..." -H "Content-Type: text/xml" -d '<xml>...</xml>'
    ```
    415 Unsupported Media Type.

## c. **Lack of Pagination Controls**
- **Mitigation:**  
  - All list endpoints require and enforce `limit` (max 100), default 20.
  - Prevents resource exhaustion.

---

# 9. Gaps in Jordan’s Auth Design (API Layer)

Jordan’s design is robust, but here’s a hypothetical gap:

## a. **JWT Audience Not Checked**
- If the API accepts any JWT issued by BrainstormMSP, but does not check `aud` claim, a token for another service could be replayed here.
- **Test:**
  ```bash
  # Use a JWT with aud: "brainstorm-other-service"
  curl -X GET /v1/findings -H "Authorization: Bearer token-with-wrong-aud"
  ```
  If this works, it’s a bug. API must enforce `aud: cspm-scanner`.

## b. **No Per-Session Revocation**
- If refresh token revocation is not enforced on every request (e.g., after password reset), a stolen token could be replayed.
- **Test:**
  - Login, grab token, reset password, try old token. Must 401.

---

# Summary Table

| Requirement                | Approach (see above for details)         |
|----------------------------|------------------------------------------|
| Input Validation           | Strict per-endpoint, reject unknowns     |
| Rate Limiting              | Per-tenant, per-endpoint, burst control  |
| Error Responses            | Generic, never leak internals            |
| API Versioning             | `/v1/` prefix, explicit deprecation      |
| Webhook Security           | HMAC + timestamp, per-tenant secret      |
| CORS/CSP                   | Only trusted origins, minimal connect-src|
| Threat Model Mitigations   | All STRIDE risks addressed at API layer  |
| Additional API Risks       | Mass assignment, content-type, pagination|
| Auth Gaps                  | Enforce JWT `aud`, session revocation    |

---

That’s how you lock down an API surface. If anyone disagrees, show me the curl command that breaks it. Otherwise, this is how we ship a secure, auditable, and abuse-resistant CSPM API.
