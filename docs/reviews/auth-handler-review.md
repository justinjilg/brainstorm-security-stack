<!-- Review consensus: critical-block (0/3 pass, 3 critical) -->

# Code Review: JWT Authentication Handler

## Casey (casey-apisec)
**Verdict: CRITICAL**

VERDICT: CRITICAL

## Findings

1. **RefreshTokenHandler uses wrong verification method** (line 119): `h.TokenService.VerifyAccessToken(refreshToken, tenantID)` — you're verifying a refresh token with the access token verification method. This is fundamentally broken.

2. **No request body size limits** on any handler. `json.NewDecoder(r.Body).Decode(&req)` will happily consume gigabytes of JSON, opening you to trivial DoS.

3. **TokenRequest.Custom accepts arbitrary data** (line 38) without validation, then blindly merges it into JWT claims (lines 69-71). I can inject reserved claims like `exp`, `iat`, or `iss` to manipulate token behavior.

4. **generateSessionID is predictable** (line 248): `userID + tenantID + timestamp`. No randomness. Session fixation attacks are possible if an attacker can predict timing.

5. **getIP trusts X-Forwarded-For unconditionally** (lines 234-237). Any client can spoof their IP by setting this header. Your audit logs are worthless.

6. **No rate limiting** on any endpoint. I can hammer `/auth/token` thousands of times per second.

7. **RefreshBlacklist.Blacklist error ignored** (line 125). If blacklisting fails, you continue issuing new tokens. This breaks your revocation mechanism.

8. **VerifyTokenHandler accepts tenant_id from query parameter** (line 156) instead of extracting it from the token. This allows cross-tenant token verification attacks.

## Security Concerns

1. **Refresh token rotation is broken**. The verification logic will fail every time, making refresh unusable or creating a security bypass depending on TokenService implementation.

2. **JWT claim injection** via Custom field is a critical vulnerability. Attackers can override security-critical claims.

3. **No CSRF protection** on state-changing endpoints. Token issuance and refresh are vulnerable to CSRF attacks.

4. **Error messages leak information**. "refresh token revoked" vs "refresh failed" tells attackers about token state.

## Suggestions

1. Fix refresh token verification immediately — use a dedicated refresh token verification method.
2. Add request body size limits: `http.MaxBytesReader(w, r.Body, 1<<20)` (1MB max).
3. Whitelist allowed custom claims. Never allow overriding standard JWT claims.
4. Use crypto/rand for session ID generation.
5. Validate X-Forwarded-For against a trusted proxy list or ignore it entirely for security events.
6. Implement rate limiting per IP/user/tenant.
7. Extract tenant_id from the token itself, never from request parameters.
8. Add CSRF tokens or require custom headers for state-changing operations.

---

## Taylor (taylor-qa)
**Verdict: CRITICAL**

VERDICT: CRITICAL

## Findings

1. **RefreshTokenHandler uses wrong verification method** (line 119): `h.TokenService.VerifyAccessToken(refreshToken, tenantID)` — you're verifying a refresh token with the access token verification method. This is fundamentally broken.

2. **No request body size limits** on any handler. `json.NewDecoder(r.Body).Decode(&req)` will happily consume gigabytes of JSON, opening you to trivial DoS.

3. **TokenRequest.Custom accepts arbitrary data** (line 38) without validation, then blindly merges it into JWT claims (lines 69-71). I can inject reserved claims like `exp`, `iat`, or `iss` to manipulate token behavior.

4. **generateSessionID is predictable** (line 248): `userID + tenantID + timestamp`. No randomness. Session fixation attacks are possible if an attacker can predict timing.

5. **getIP trusts X-Forwarded-For unconditionally** (lines 234-237). Any client can spoof their IP by setting this header. Your audit logs are worthless.

6. **No rate limiting** on any endpoint. I can hammer `/auth/token` thousands of times per second.

7. **RefreshBlacklist.Blacklist error ignored** (line 125). If blacklisting fails, you continue issuing new tokens. This breaks your revocation mechanism.

8. **VerifyTokenHandler accepts tenant_id from query parameter** (line 156) instead of extracting it from the token. This allows cross-tenant token verification attacks.

## Security Concerns

1. **Refresh token rotation is broken**. The verification logic will fail every time, making refresh unusable or creating a security bypass depending on TokenService implementation.

2. **JWT claim injection** via Custom field is a critical vulnerability. Attackers can override security-critical claims.

3. **No CSRF protection** on state-changing endpoints. Token issuance and refresh are vulnerable to CSRF attacks.

4. **Error messages leak information**. "refresh token revoked" vs "refresh failed" tells attackers about token state.

## Suggestions

1. Fix refresh token verification immediately — use a dedicated refresh token verification method.
2. Add request body size limits: `http.MaxBytesReader(w, r.Body, 1<<20)` (1MB max).
3. Whitelist allowed custom claims. Never allow overriding standard JWT claims.
4. Use crypto/rand for session ID generation.
5. Validate X-Forwarded-For against a trusted proxy list or ignore it entirely for security events.
6. Implement rate limiting per IP/user/tenant.
7. Extract tenant_id from the token itself, never from request parameters.
8. Add CSRF tokens or require custom headers for state-changing operations.

---

## Alex (alex-crypto)
**Verdict: CRITICAL**

VERDICT: CRITICAL

## Findings

1. **RefreshTokenHandler uses wrong verification method** (line 119): `h.TokenService.VerifyAccessToken(refreshToken, tenantID)` — you're verifying a refresh token with the access token verification method. This is fundamentally broken.

2. **No request body size limits** on any handler. `json.NewDecoder(r.Body).Decode(&req)` will happily consume gigabytes of JSON, opening you to trivial DoS.

3. **TokenRequest.Custom accepts arbitrary data** (line 38) without validation, then blindly merges it into JWT claims (lines 69-71). I can inject reserved claims like `exp`, `iat`, or `iss` to manipulate token behavior.

4. **generateSessionID is predictable** (line 248): `userID + tenantID + timestamp`. No randomness. Session fixation attacks are possible if an attacker can predict timing.

5. **getIP trusts X-Forwarded-For unconditionally** (lines 234-237). Any client can spoof their IP by setting this header. Your audit logs are worthless.

6. **No rate limiting** on any endpoint. I can hammer `/auth/token` thousands of times per second.

7. **RefreshBlacklist.Blacklist error ignored** (line 125). If blacklisting fails, you continue issuing new tokens. This breaks your revocation mechanism.

8. **VerifyTokenHandler accepts tenant_id from query parameter** (line 156) instead of extracting it from the token. This allows cross-tenant token verification attacks.

## Security Concerns

1. **Refresh token rotation is broken**. The verification logic will fail every time, making refresh unusable or creating a security bypass depending on TokenService implementation.

2. **JWT claim injection** via Custom field is a critical vulnerability. Attackers can override security-critical claims.

3. **No CSRF protection** on state-changing endpoints. Token issuance and refresh are vulnerable to CSRF attacks.

4. **Error messages leak information**. "refresh token revoked" vs "refresh failed" tells attackers about token state.

## Suggestions

1. Fix refresh token verification immediately — use a dedicated refresh token verification method.
2. Add request body size limits: `http.MaxBytesReader(w, r.Body, 1<<20)` (1MB max).
3. Whitelist allowed custom claims. Never allow overriding standard JWT claims.
4. Use crypto/rand for session ID generation.
5. Validate X-Forwarded-For against a trusted proxy list or ignore it entirely for security events.
6. Implement rate limiting per IP/user/tenant.
7. Extract tenant_id from the token itself, never from request parameters.
8. Add CSRF tokens or require custom headers for state-changing operations.
