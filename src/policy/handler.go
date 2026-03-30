<!-- Agent: jordan-auth | Model: gpt-4.1-2025-04-14 | Cost: $0.0275 | Latency: 227948ms -->
<!-- Route: explicit | Quality: 0.76 | Reputation: gold -->
<!-- Budget remaining: $49.93 -->
Absolutely. Here’s how I’d approach this, referencing both the JWT/RBAC model in [`docs/architecture/auth-design-v1.md`](#) and the JWT implementation in [`src/auth/handler.go`](#):

---

# Policy Engine HTTP Handler (Go)

**Requirements:**
- All endpoints require a valid JWT (verified via `VerifyJWTMiddleware`).
- RBAC enforced per role/permission matrix (see ADR-002).
- Endpoints:
  - `POST /v1/policy/evaluate`: Evaluate policies against a resource or batch of resources.  
    - Only `MSP_OPERATOR` and `SEC_ENGINEER` can evaluate policies.
    - Input: resource(s) as JSON.
    - Output: findings as JSON.
- All responses must avoid leaking internal errors.
- Claims are extracted from request context (see `GetAuthClaims` in `src/auth/handler.go`).

---

## Implementation

```go
package policy

import (
    "encoding/json"
    "net/http"
    "src/auth" // Adjust import path as needed
)

// --- RBAC Enforcement ---

func requireRole(allowedRoles ...string) func(http.Handler) http.Handler {
    allowed := make(map[string]struct{})
    for _, r := range allowedRoles {
        allowed[r] = struct{}{}
    }
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            claims, ok := auth.GetAuthClaims(r)
            if !ok {
                auth.WriteJSONError(w, "unauthorized", "Missing auth claims", http.StatusUnauthorized)
                return
            }
            for _, role := range claims.Roles {
                if _, exists := allowed[role]; exists {
                    next.ServeHTTP(w, r)
                    return
                }
            }
            auth.WriteJSONError(w, "forbidden", "Insufficient role", http.StatusForbidden)
        })
    }
}

// --- Input Types ---

type EvaluateRequest struct {
    Resources []Resource `json:"resources"`
}

type EvaluateResponse struct {
    Findings []Finding `json:"findings"`
}

// --- Handler ---

func EvaluatePoliciesHandler(engine *PolicyEngine) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // Input validation
        var req EvaluateRequest
        decoder := json.NewDecoder(r.Body)
        decoder.DisallowUnknownFields()
        if err := decoder.Decode(&req); err != nil || len(req.Resources) == 0 {
            auth.WriteJSONError(w, "invalid_request", "Malformed or missing resources", http.StatusBadRequest)
            return
        }

        // Extract claims for multi-tenancy enforcement
        claims, ok := auth.GetAuthClaims(r)
        if !ok {
            auth.WriteJSONError(w, "unauthorized", "Missing auth claims", http.StatusUnauthorized)
            return
        }

        // Enforce tenant/sub-tenant isolation
        for i := range req.Resources {
            if req.Resources[i]["tenant_id"] != claims.TenantID {
                auth.WriteJSONError(w, "forbidden", "Tenant mismatch", http.StatusForbidden)
                return
            }
            // Optionally enforce sub_tenant_ids
            if subID, ok := req.Resources[i]["sub_tenant_id"].(string); ok {
                found := false
                for _, allowed := range claims.SubTenantIDs {
                    if allowed == subID {
                        found = true
                        break
                    }
                }
                if !found {
                    auth.WriteJSONError(w, "forbidden", "Sub-tenant access denied", http.StatusForbidden)
                    return
                }
            }
        }

        // Evaluate policies
        var findings []Finding
        for _, res := range req.Resources {
            fs, err := engine.EvaluateResource(res)
            if err != nil {
                // Do not leak details
                auth.WriteJSONError(w, "evaluation_error", "Policy evaluation failed", http.StatusInternalServerError)
                return
            }
            findings = append(findings, fs...)
        }
        resp := EvaluateResponse{Findings: findings}
        auth.WriteJSON(w, resp, http.StatusOK)
    })
}

// --- Router Setup Example ---

func RegisterPolicyRoutes(mux *http.ServeMux, engine *PolicyEngine) {
    // Only MSP_OPERATOR and SEC_ENGINEER can evaluate policies
    handler := auth.VerifyJWTMiddleware(
        requireRole("MSP_OPERATOR", "SEC_ENGINEER")(
            EvaluatePoliciesHandler(engine),
        ),
    )
    mux.Handle("/v1/policy/evaluate", handler)
}
```

---

## Key Points

- **JWT Verification:** All requests pass through `VerifyJWTMiddleware`.
- **RBAC Enforcement:** `requireRole` middleware checks for allowed roles.
- **Tenant Isolation:** Resources in request must match `tenant_id` and be in allowed `sub_tenant_ids`.
- **No Internal Error Leakage:** All errors are generic, per Casey’s requirements.
- **Extensible:** Add more endpoints (e.g., policy listing) with similar RBAC checks.

---

**Let me know if you want endpoints for policy management, or stricter ABAC checks.**
