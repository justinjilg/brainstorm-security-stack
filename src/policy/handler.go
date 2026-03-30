//go:build integration
// +build integration

// Note: Excluded from default builds until auth package is fully implemented.
// Enable with: go build -tags integration ./...

package policy

import (
	"encoding/json"
	"net/http"

	"github.com/justinjilg/brainstorm-security-stack/src/auth"
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
