package auth

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"
)

// --- RBAC Constants ---
const (
	RoleMSPAdmin         = "msp_admin"
	RoleSecurityAnalyst  = "security_analyst"
	RoleComplianceOfficer = "compliance_officer"
)

var reservedClaims = map[string]struct{}{
	"exp":       {},
	"iat":       {},
	"nbf":       {},
	"iss":       {},
	"aud":       {},
	"sub":       {},
	"jti":       {},
	"tenant_id": {},
	"roles":     {},
	"user_id":   {},
	"session_id":{},
	"issued_by": {},
}

// --- TokenService Interface ---

type TokenService interface {
	IssueAccessToken(userID string, tenantID string, roles []string, customClaims map[string]interface{}) (accessToken string, refreshToken string, err error)
	VerifyAccessToken(token string, tenantID string) (*Claims, error)
	VerifyRefreshToken(token string, tenantID string) (*Claims, error)
	RotateRefreshToken(refreshToken string, tenantID string) (newRefreshToken string, err error)
}

// --- Claims Struct ---

type Claims struct {
	UserID    string                 `json:"user_id"`
	TenantID  string                 `json:"tenant_id"`
	Roles     []string               `json:"roles"`
	SessionID string                 `json:"session_id"`
	IssuedBy  string                 `json:"issued_by"`
	Custom    map[string]interface{} `json:"custom,omitempty"`
	Exp       int64                  `json:"exp"`
	Iat       int64                  `json:"iat"`
	Aud       string                 `json:"aud"`
	Iss       string                 `json:"iss"`
}

// --- RBACService Interface ---

type RBACService interface {
	HasRole(requiredRoles []string, userRoles []string) bool
}

// --- AuditLogger Interface ---

type AuditLogger interface {
	Log(event string, details map[string]interface{})
}

// --- TenantConfigManager Interface ---

type TenantConfigManager interface {
	GetTenantRoles(tenantID string) ([]string, error)
}

// --- Handler Struct ---

type Handler struct {
	TokenService        TokenService
	RBACService         RBACService
	AuditLogger         AuditLogger
	TenantConfigManager TenantConfigManager
}

// --- TokenRequest Struct ---

type TokenRequest struct {
	UserID      string                 `json:"user_id"`
	TenantID    string                 `json:"tenant_id"`
	Roles       []string               `json:"roles"`
	SessionID   string                 `json:"session_id"`
	IssuedBy    string                 `json:"issued_by"`
	Custom      map[string]interface{} `json:"custom,omitempty"`
}

// --- TokenResponse Struct ---

type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"`
	TokenType    string `json:"token_type"`
}

// --- RefreshRequest Struct ---

type RefreshRequest struct {
	TenantID     string `json:"tenant_id"`
	RefreshToken string `json:"refresh_token"`
}

// --- RefreshResponse Struct ---

type RefreshResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"`
	TokenType    string `json:"token_type"`
}

// --- Utility: Validate Custom Claims ---

func validateCustomClaims(custom map[string]interface{}) error {
	for k := range custom {
		if _, reserved := reservedClaims[strings.ToLower(k)]; reserved {
			return errors.New("custom claim '" + k + "' is reserved and cannot be set")
		}
	}
	return nil
}

// --- Utility: Limit Request Body Size ---

const maxBodyBytes = 1 << 16 // 64 KiB

func decodeJSONLimited(r io.Reader, v interface{}) error {
	limited := io.LimitReader(r, maxBodyBytes)
	dec := json.NewDecoder(limited)
	return dec.Decode(v)
}

// --- Handler: Token Issuance ---

func (h *Handler) TokenIssuanceHandler(w http.ResponseWriter, r *http.Request) {
	var req TokenRequest
	if err := decodeJSONLimited(r.Body, &req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.UserID == "" || req.TenantID == "" || len(req.Roles) == 0 || req.SessionID == "" || req.IssuedBy == "" {
		http.Error(w, "missing required fields", http.StatusBadRequest)
		return
	}
	if req.Custom == nil {
		req.Custom = make(map[string]interface{})
	}
	if err := validateCustomClaims(req.Custom); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	accessToken, refreshToken, err := h.TokenService.IssueAccessToken(
		req.UserID,
		req.TenantID,
		req.Roles,
		req.Custom,
	)
	if err != nil {
		http.Error(w, "failed to issue token", http.StatusInternalServerError)
		return
	}
	h.AuditLogger.Log("token_issued", map[string]interface{}{
		"user_id":   req.UserID,
		"tenant_id": req.TenantID,
		"session_id": req.SessionID,
		"issued_by": req.IssuedBy,
		"time":      time.Now().UTC().Format(time.RFC3339),
	})
	resp := TokenResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    900, // 15 min, adjust as needed
		TokenType:    "Bearer",
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// --- Handler: Token Verification (RBAC Enforcement) ---

func (h *Handler) RBACMiddleware(requiredRoles []string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authz := r.Header.Get("Authorization")
		if !strings.HasPrefix(authz, "Bearer ") {
			http.Error(w, "missing or invalid Authorization header", http.StatusUnauthorized)
			return
		}
		token := strings.TrimPrefix(authz, "Bearer ")
		tenantID := r.Header.Get("X-Tenant-ID")
		if tenantID == "" {
			http.Error(w, "missing X-Tenant-ID header", http.StatusBadRequest)
			return
		}
		claims, err := h.TokenService.VerifyAccessToken(token, tenantID)
		if err != nil {
			http.Error(w, "invalid or expired token", http.StatusUnauthorized)
			return
		}
		if !h.RBACService.HasRole(requiredRoles, claims.Roles) {
			http.Error(w, "forbidden: insufficient role", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// --- Handler: Refresh Token ---

func (h *Handler) RefreshTokenHandler(w http.ResponseWriter, r *http.Request) {
	var req RefreshRequest
	if err := decodeJSONLimited(r.Body, &req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.TenantID == "" || req.RefreshToken == "" {
		http.Error(w, "missing required fields", http.StatusBadRequest)
		return
	}
	claims, err := h.TokenService.VerifyRefreshToken(req.RefreshToken, req.TenantID)
	if err != nil {
		http.Error(w, "invalid or expired refresh token", http.StatusUnauthorized)
		return
	}
	newRefreshToken, err := h.TokenService.RotateRefreshToken(req.RefreshToken, req.TenantID)
	if err != nil {
		http.Error(w, "failed to rotate refresh token", http.StatusInternalServerError)
		return
	}
	accessToken, _, err := h.TokenService.IssueAccessToken(
		claims.UserID,
		claims.TenantID,
		claims.Roles,
		claims.Custom,
	)
	if err != nil {
		http.Error(w, "failed to issue access token", http.StatusInternalServerError)
		return
	}
	h.AuditLogger.Log("refresh_token_rotated", map[string]interface{}{
		"user_id":   claims.UserID,
		"tenant_id": claims.TenantID,
		"session_id": claims.SessionID,
		"issued_by": claims.IssuedBy,
		"time":      time.Now().UTC().Format(time.RFC3339),
	})
	resp := RefreshResponse{
		AccessToken:  accessToken,
		RefreshToken: newRefreshToken,
		ExpiresIn:    900, // 15 min, adjust as needed
		TokenType:    "Bearer",
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// --- Example RBACService Implementation ---

type DefaultRBACService struct{}

func (s *DefaultRBACService) HasRole(requiredRoles []string, userRoles []string) bool {
	roleSet := make(map[string]struct{}, len(userRoles))
	for _, r := range userRoles {
		roleSet[r] = struct{}{}
	}
	for _, req := range requiredRoles {
		if _, ok := roleSet[req]; ok {
			return true
		}
	}
	return false
}
