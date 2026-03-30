<!-- Agent: jordan-auth | Model: gpt-4.1-2025-04-14 | Cost: $0.0375 | Latency: 240635ms -->
<!-- Route: explicit | Quality: 0.76 | Reputation: gold -->
<!-- Budget remaining: $49.97 -->
Absolutely. Here’s a Go implementation of an authentication handler that issues and verifies JWTs according to the requirements in:

- [docs/architecture/auth-design-v1.md](#) (Jordan: JWT structure, claims, rotation, RBAC)
- [docs/security/crypto-requirements-v1.md](#) (Alex: ECDSA/Ed25519, key management, rotation)
- [docs/security/api-security-requirements-v1.md](#) (Casey: input validation, error handling, audience check, no leakage)

**Assumptions:**
- JWTs are signed with ECDSA P-256 (ES256) or Ed25519, not HMAC.
- Issuer is `BrainstormMSP`.
- Audience must match (`cspm-scanner`).
- Short-lived access tokens (15m), refresh tokens (8h).
- Key material is loaded from a secure source (e.g., HSM or KMS), but for this example, we use in-memory keys.
- Error responses are generic, never leak internals.
- Input validation is strict.
- No user registration or password logic here—this is for token issuance (on successful login) and verification middleware.

---

```go
package auth

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ---- JWT Key Management ----

// In production, load these from HSM/KMS, not from memory!
var (
	ecdsaPrivateKey *ecdsa.PrivateKey
	ecdsaPublicKey  *ecdsa.PublicKey
	issuer          = "BrainstormMSP"
	audience        = "cspm-scanner"
)

func init() {
	// For demo: generate a new ECDSA P-256 keypair
	var err error
	ecdsaPrivateKey, err = ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		panic("failed to generate ECDSA key: " + err.Error())
	}
	ecdsaPublicKey = &ecdsaPrivateKey.PublicKey
}

// ---- JWT Claims ----

type CustomClaims struct {
	TenantID      string   `json:"tenant_id"`
	SubTenantIDs  []string `json:"sub_tenant_ids"`
	Roles         []string `json:"roles"`
	Permissions   []string `json:"permissions,omitempty"`
	jwt.RegisteredClaims
}

// ---- Token Issuance ----

type IssueTokenRequest struct {
	UserID        string   `json:"user_id"`
	TenantID      string   `json:"tenant_id"`
	SubTenantIDs  []string `json:"sub_tenant_ids"`
	Roles         []string `json:"roles"`
	Permissions   []string `json:"permissions,omitempty"`
	TokenType     string   `json:"token_type"` // "access" or "refresh"
}

type IssueTokenResponse struct {
	Token string `json:"token"`
	Exp   int64  `json:"exp"`
}

// Input validation per requirements
func validateIssueTokenRequest(req *IssueTokenRequest) error {
	if req.UserID == "" || len(req.UserID) > 64 {
		return errors.New("invalid user_id")
	}
	if req.TenantID == "" || len(req.TenantID) > 64 {
		return errors.New("invalid tenant_id")
	}
	if len(req.SubTenantIDs) == 0 || len(req.SubTenantIDs) > 100 {
		return errors.New("invalid sub_tenant_ids")
	}
	for _, id := range req.SubTenantIDs {
		if id == "" || len(id) > 64 {
			return errors.New("invalid sub_tenant_id")
		}
	}
	if len(req.Roles) == 0 {
		return errors.New("at least one role required")
	}
	for _, role := range req.Roles {
		if !isValidRole(role) {
			return fmt.Errorf("invalid role: %s", role)
		}
	}
	if req.TokenType != "access" && req.TokenType != "refresh" {
		return errors.New("invalid token_type")
	}
	return nil
}

func isValidRole(role string) bool {
	switch role {
	case "MSP_OPERATOR", "SEC_ENGINEER", "COMPLIANCE_OFFICER":
		return true
	}
	return false
}

func IssueTokenHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req IssueTokenRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		writeJSONError(w, "invalid_request", "Malformed JSON", http.StatusBadRequest)
		return
	}
	if err := validateIssueTokenRequest(&req); err != nil {
		writeJSONError(w, "invalid_request", err.Error(), http.StatusBadRequest)
		return
	}

	now := time.Now().UTC()
	var exp time.Time
	switch req.TokenType {
	case "access":
		exp = now.Add(15 * time.Minute)
	case "refresh":
		exp = now.Add(8 * time.Hour)
	}

	claims := CustomClaims{
		TenantID:     req.TenantID,
		SubTenantIDs: req.SubTenantIDs,
		Roles:        req.Roles,
		Permissions:  req.Permissions,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   req.UserID,
			Issuer:    issuer,
			Audience:  jwt.ClaimStrings{audience},
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(exp),
			ID:        generateJTI(), // cryptographically random
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodES256, claims)
	signed, err := token.SignedString(ecdsaPrivateKey)
	if err != nil {
		writeJSONError(w, "server_error", "Token signing failed", http.StatusInternalServerError)
		return
	}

	resp := IssueTokenResponse{
		Token: signed,
		Exp:   exp.Unix(),
	}
	writeJSON(w, resp, http.StatusOK)
}

// ---- JWT Verification Middleware ----

func VerifyJWTMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authz := r.Header.Get("Authorization")
		if !strings.HasPrefix(authz, "Bearer ") {
			writeJSONError(w, "unauthorized", "Missing or invalid token", http.StatusUnauthorized)
			return
		}
		raw := strings.TrimPrefix(authz, "Bearer ")
		token, err := jwt.ParseWithClaims(raw, &CustomClaims{}, func(token *jwt.Token) (interface{}, error) {
			// Enforce ECDSA
			if _, ok := token.Method.(*jwt.SigningMethodECDSA); !ok {
				return nil, fmt.Errorf("unexpected signing method")
			}
			return ecdsaPublicKey, nil
		}, jwt.WithAudience(audience), jwt.WithIssuer(issuer))
		if err != nil || !token.Valid {
			writeJSONError(w, "unauthorized", "Invalid or expired token", http.StatusUnauthorized)
			return
		}
		claims, ok := token.Claims.(*CustomClaims)
		if !ok {
			writeJSONError(w, "unauthorized", "Invalid token claims", http.StatusUnauthorized)
			return
		}
		// Optionally: check jti against revocation list here

		// Attach claims to context for downstream handlers
		ctx := r.Context()
		ctx = WithAuthClaims(ctx, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// ---- Context Utilities ----

type ctxKey int

const authClaimsKey ctxKey = 0

func WithAuthClaims(ctx interface{}, claims *CustomClaims) interface{} {
	return context.WithValue(ctx.(context.Context), authClaimsKey, claims)
}

func GetAuthClaims(r *http.Request) (*CustomClaims, bool) {
	claims, ok := r.Context().Value(authClaimsKey).(*CustomClaims)
	return claims, ok
}

// ---- Helpers ----

func writeJSON(w http.ResponseWriter, v interface{}, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeJSONError(w http.ResponseWriter, code, msg string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	// Never leak internal details
	json.NewEncoder(w).Encode(map[string]string{
		"error":   code,
		"message": msg,
	})
}

func generateJTI() string {
	b := make([]byte, 16)
	rand.Read(b)
	return fmt.Sprintf("%x", b)
}

// ---- Example Usage ----

/*
func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/auth/issue", IssueTokenHandler)
	mux.Handle("/v1/protected", VerifyJWTMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, _ := GetAuthClaims(r)
		writeJSON(w, claims, http.StatusOK)
	})))
	http.ListenAndServe(":8080", mux)
}
*/

```

---

## Key Points

- **JWT signing:** ECDSA P-256 (can swap for Ed25519 with a different library if desired).
- **Claims:** All required fields (`tenant_id`, `sub_tenant_ids`, `roles`, etc.), plus standard claims.
- **Audience/issuer enforced** on both issuance and verification.
- **Input validation:** Strict, with clear error messages, never leaking internals.
- **Error handling:** Per Casey’s requirements—generic, no stack traces or internal details.
- **Extensible:** Add RBAC/permission checks downstream using claims from context.
- **No secrets in logs:** No sensitive data is logged or returned in errors.

---

**To productionize:**  
- Replace in-memory key generation with HSM/KMS integration.
- Implement refresh token rotation, revocation checks (e.g., Redis-backed blacklist).
- Add rate limiting, audit logging, and secure key distribution as per full requirements.

Let me know if you need the refresh token handler, revocation logic, or integration with your user DB.
