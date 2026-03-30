<!-- Agent: taylor-qa | Model: gpt-4.1-2025-04-14 | Cost: $0.0235 | Latency: 110649ms -->
<!-- Route: explicit | Quality: 0.73 | Reputation: gold -->
<!-- Budget remaining: $49.95 -->
Absolutely. Here’s a detailed test plan for the **AWS Scanner** and **Authentication Handler** Go modules, structured according to the [test strategy](docs/testing/test-strategy-v1.md). I’ll break down unit, integration, and edge/negative tests for both components, with explicit focus on error handling and security boundaries.

---

# Test Plan: AWS Scanner & Authentication Handler

## Reference: [CSPM Scanner v1 Test Strategy](docs/testing/test-strategy-v1.md)

- **Unit tests:** Fast, deterministic, use mocks/stubs, cover logic and edge cases.
- **Integration tests:** Real dependencies (AWS, JWT parsing), test end-to-end flows and system boundaries.
- **Edge/negative tests:** Malformed input, expired tokens, API failures, permissions, etc.
- **Security boundaries:** No secret leakage, strict input validation, correct privilege enforcement.

---

## 1. AWS Scanner (`internal/scanner/aws_scanner.go`)

### 1.1. Unit Tests

**Goal:** Validate logic, error handling, and data mapping in isolation.

#### a) EC2/S3 Discovery Logic

- GIVEN mocked AWS SDK clients
    - WHEN `discoverAllEC2Instances` is called
        - THEN it returns correctly mapped `AwsEC2Instance` structs for various reservation/instance shapes (single, multiple, no tags, empty reservations).
    - WHEN `discoverAllS3Buckets` is called
        - THEN it returns correctly mapped `AwsS3Bucket` structs, including correct region mapping for buckets in `us-east-1` (empty location constraint).

#### b) Error Handling

- GIVEN AWS SDK returns an error (e.g., network, access denied)
    - WHEN discovery methods are called
        - THEN errors are propagated and wrapped, not swallowed.
- GIVEN region discovery fails
    - THEN EC2 discovery fails gracefully with a clear error.

#### c) Defensive Coding

- GIVEN S3 bucket region lookup fails for a bucket
    - THEN the bucket is skipped, and the scanner does not panic or return partial results with nil/invalid regions.

#### d) No Secret Leakage

- GIVEN errors occur
    - THEN no AWS credentials or sensitive info are ever included in error messages or logs.

### 1.2. Integration Tests

**Goal:** Validate real AWS API interactions and multi-region/multi-resource enumeration.

- GIVEN valid AWS credentials (in CI or test environment)
    - WHEN `DiscoverResources` is called
        - THEN EC2 and S3 resources are discovered across all accessible regions/accounts.
- GIVEN credentials with limited permissions
    - THEN scanner returns only accessible resources, and access-denied errors are handled gracefully.

### 1.3. Edge & Negative Tests

- GIVEN no EC2 instances or S3 buckets exist
    - THEN scanner returns empty lists, not nil or errors.
- GIVEN AWS API throttling or transient network failures
    - THEN scanner retries (if implemented) or fails with a clear, non-leaky error.
- GIVEN malformed or expired credentials
    - THEN scanner returns an error without leaking credential details.

### 1.4. Security Boundaries

- Test that no logs or errors ever include AWS secret keys or tokens.
- Test that the scanner never escalates privileges or attempts actions beyond read/list.
- Test that the scanner fails closed (no partial/ambiguous results) on permission errors.

---

## 2. Authentication Handler (`src/auth/handler.go`)

### 2.1. Unit Tests

**Goal:** Validate JWT issuance, verification, claims, and strict input validation.

#### a) Token Issuance

- GIVEN valid `IssueTokenRequest`
    - WHEN `IssueTokenHandler` is called
        - THEN a JWT is returned with correct claims, expiry, audience, and issuer.
- GIVEN invalid/missing fields (user_id, tenant_id, roles, etc.)
    - THEN handler responds with HTTP 400 and generic error (no stack trace, no internals).

#### b) Token Verification

- GIVEN valid JWT (signed by current key, correct audience/issuer)
    - WHEN `VerifyJWTMiddleware` is called
        - THEN request proceeds and claims are available in context.
- GIVEN invalid JWT (wrong signature, expired, wrong audience/issuer)
    - THEN handler responds with HTTP 401 and generic error.

#### c) Claims Validation

- GIVEN JWT with missing/extra/invalid claims
    - THEN verification fails with HTTP 401.

#### d) Key Management

- GIVEN token signed with wrong key or algorithm
    - THEN verification fails.

### 2.2. Integration Tests

**Goal:** Validate end-to-end flows and security boundaries.

- GIVEN a token is issued via `/v1/auth/issue`
    - WHEN used to access a protected endpoint with `VerifyJWTMiddleware`
        - THEN access is granted and claims are present.
- GIVEN a refresh token (if implemented)
    - THEN expiry and rotation are enforced.
- GIVEN multiple concurrent requests
    - THEN tokens are unique (JTI), and no race conditions occur.

### 2.3. Edge & Negative Tests

- GIVEN malformed JSON in issue request
    - THEN HTTP 400 with generic error.
- GIVEN unsupported HTTP method
    - THEN HTTP 405.
- GIVEN audience or issuer mismatch
    - THEN HTTP 401.
- GIVEN replayed, expired, or revoked token (if revocation implemented)
    - THEN HTTP 401.
- GIVEN attempt to use HMAC or other signing methods
    - THEN verification fails.

### 2.4. Security Boundaries

- Test that no secrets (private keys, user data) are ever leaked in errors or logs.
- Test that only allowed roles/permissions are accepted (invalid roles rejected).
- Test that tokens cannot be forged with alternate algorithms (alg=none, etc.).
- Test that audience and issuer checks are enforced on every verification.
- Test input validation: overlong fields, Unicode, injection attempts.

---

## 3. Coverage & Tooling

- **Unit:** Use Go’s `testing` package + AWS SDK stubs/mocks + table-driven tests.
- **Integration:** Use real AWS sandbox account (with read-only IAM), and local JWT endpoints.
- **Edge:** Fuzz test JWT parsing, input validation, and AWS API error handling.
- **Security:** Add static analysis (gosec), and secret scanning to CI.

---

## 4. Reporting

- All tests must assert on both success and error paths.
- All error messages checked for absence of secrets.
- All security boundaries (audience/issuer, permissions, error handling) must have explicit tests.
- Coverage reports must highlight not just lines, but branches (error handling, input validation).

---

## 5. Example Test Cases (GIVEN/WHEN/THEN)

### AWS Scanner

- GIVEN a region with no EC2 instances  
  WHEN `discoverAllEC2Instances` is called  
  THEN it returns an empty slice, not nil or error.

- GIVEN an S3 bucket with no region (us-east-1)  
  WHEN region lookup is performed  
  THEN region is set to "us-east-1".

- GIVEN AWS returns AccessDenied on region list  
  WHEN `listAwsRegions` is called  
  THEN error is returned, and no regions are scanned.

### Authentication Handler

- GIVEN a JWT with the wrong audience  
  WHEN verification middleware is called  
  THEN HTTP 401 is returned.

- GIVEN a token request with an invalid role  
  WHEN `IssueTokenHandler` is called  
  THEN HTTP 400 is returned with a generic error.

- GIVEN a JWT signed with HMAC instead of ECDSA  
  WHEN verification is attempted  
  THEN HTTP 401 is returned.

---

**Summary:**  
This plan ensures we test not just the happy path, but all the ways things can go wrong—malformed input, expired tokens, AWS errors, and privilege boundaries. Every error path is covered. No secrets are leaked. Security boundaries are enforced and tested. If you want sample test code or CI config, let me know.
