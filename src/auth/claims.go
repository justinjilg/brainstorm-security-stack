package auth

import (
	"crypto/ecdsa"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strings"
	"time"

	"example.com/project/audit"
	"example.com/project/keymanager"
	"example.com/project/rbac"
	"example.com/project/tenantconfig"
	"example.com/project/token"
)

// Handler encapsulates dependencies for JWT authentication endpoints.
type Handler struct {
	TokenService     token.TokenService
	RBACService      rbac.RBACService
	KeyManager       keymanager.KeyManager
	AuditLogger      audit.AuditLogger
	TenantConfig     tenantconfig.TenantConfigManager
	TokenConfig      token.TokenConfig
	RefreshBlacklist RefreshTokenBlacklist
}

// RefreshTokenBlacklist provides refresh token revocation.
type RefreshTokenBlacklist interface {
	IsBlacklisted(token string) bool
	Blacklist(token string) error
}

// TokenRequest represents a login or token refresh request.
type TokenRequest struct {
	UserID       string                 `json:"user_id"`
	TenantID     string                 `json:"tenant_id"`
	Roles        []string               `json:"roles"`
	Custom       map[string]interface{} `json:"custom,omitempty"`
	RefreshToken string                 `json:"refresh_token,omitempty"`
}

// TokenResponse represents a JWT issuance or refresh response.
type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"`
	TokenType    string `json:"token_type"`
}

// RBACRequest wraps a request for RBAC enforcement.
type RBACRequest struct {
	Resource string `json:"resource"`
	Action   string `json:"action"`
}

// IssueTokenHandler handles POST /auth/token for initial JWT issuance.
func (h *Handler) IssueTokenHandler(w http.ResponseWriter, r *http.Request) {
	var req TokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.UserID == "" || req.TenantID == "" || len(req.Roles) == 0 {
		http.Error(w, "missing required fields", http.StatusBadRequest)
		return
	}
	ip := getIP(r)
	now := time.Now().Unix()
	sessionID := generateSessionID(req.UserID, req.TenantID, now)
	claims := map[string]interface{}{
		"session_id": sessionID,
		"issued_by":  "auth_handler",
		"ip_address": ip,
	}
	for k, v := range req.Custom {
		claims[k] = v
	}
	accessToken, refreshToken, err := h.TokenService.IssueAccessToken(
		req.UserID, req.TenantID, req.Roles, claims,
	)
	if err != nil {
		http.Error(w, "token issuance failed", http.StatusInternalServerError)
		h.AuditLogger.LogEvent("token_issue_failed", map[string]interface{}{
			"user_id":   req.UserID,
			"tenant_id": req.TenantID,
			"ip":        ip,
			"error":     err.Error(),
		})
		return
	}
	h.AuditLogger.LogEvent("token_issued", map[string]interface{}{
		"user_id":    req.UserID,
		"tenant_id":  req.TenantID,
		"session_id": sessionID,
		"ip":         ip,
	})
	resp := TokenResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    int64(h.TokenConfig.AccessTokenTTL.Seconds()),
		TokenType:    "Bearer",
	}
	writeJSON(w, resp)
}

// RefreshTokenHandler handles POST /auth/refresh to rotate refresh tokens.
func (h *Handler) RefreshTokenHandler(w http.ResponseWriter, r *http.Request) {
	var req TokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	refreshToken := req.RefreshToken
	tenantID := req.TenantID
	ip := getIP(r)
	if refreshToken == "" || tenantID == "" {
		http.Error(w, "missing refresh_token or tenant_id", http.StatusBadRequest)
		return
	}
	if h.RefreshBlacklist.IsBlacklisted(refreshToken) {
		http.Error(w, "refresh token revoked", http.StatusUnauthorized)
		h.AuditLogger.LogEvent("refresh_token_reused", map[string]interface{}{
			"tenant_id": tenantID,
			"ip":        ip,
		})
		return
	}
	newRefreshToken, err := h.TokenService.RotateRefreshToken(refreshToken, tenantID)
	if err != nil {
		http.Error(w, "refresh failed", http.StatusUnauthorized)
		h.AuditLogger.LogEvent("refresh_token_failed", map[string]interface{}{
			"tenant_id": tenantID,
			"ip":        ip,
			"error":     err.Error(),
		})
		return
	}
	claims, err := h.TokenService.VerifyAccessToken(refreshToken, tenantID)
	if err != nil {
		http.Error(w, "invalid refresh token", http.StatusUnauthorized)
		return
	}
	h.RefreshBlacklist.Blacklist(refreshToken)
	accessToken, _, err := h.TokenService.IssueAccessToken(
		claims.UserID, claims.TenantID, claims.Roles, claims.Custom,
	)
	if err != nil {
		http.Error(w, "token issuance failed", http.StatusInternalServerError)
		return
	}
	h.AuditLogger.LogEvent("token_refreshed", map[string]interface{}{
		"user_id":    claims.UserID,
		"tenant_id":  claims.TenantID,
		"session_id": claims.SessionID,
		"ip":         ip,
	})
	resp := TokenResponse{
		AccessToken:  accessToken,
		RefreshToken: newRefreshToken,
		ExpiresIn:    int64(h.TokenConfig.AccessTokenTTL.Seconds()),
		TokenType:    "Bearer",
	}
	writeJSON(w, resp)
}

// VerifyTokenHandler handles POST /auth/verify to verify JWTs.
func (h *Handler) VerifyTokenHandler(w http.ResponseWriter, r *http.Request) {
	tokenString := extractBearerToken(r)
	tenantID := r.URL.Query().Get("tenant_id")
	ip := getIP(r)
	if tokenString == "" || tenantID == "" {
		http.Error(w, "missing token or tenant_id", http.StatusBadRequest)
		return
	}
	claims, err := h.TokenService.VerifyAccessToken(tokenString, tenantID)
	if err != nil {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		h.AuditLogger.LogEvent("token_verification_failed", map[string]interface{}{
			"tenant_id": tenantID,
			"ip":        ip,
			"error":     err.Error(),
		})
		return
	}
	h.AuditLogger.LogEvent("token_verified", map[string]interface{}{
		"user_id":    claims.UserID,
		"tenant_id":  claims.TenantID,
		"session_id": claims.SessionID,
		"ip":         ip,
	})
	writeJSON(w, claims)
}

// RBACEnforceHandler enforces RBAC for a given resource/action.
func (h *Handler) RBACEnforceHandler(w http.ResponseWriter, r *http.Request) {
	tokenString := extractBearerToken(r)
	tenantID := r.URL.Query().Get("tenant_id")
	var req RBACRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if tokenString == "" || tenantID == "" {
		http.Error(w, "missing token or tenant_id", http.StatusBadRequest)
		return
	}
	claims, err := h.TokenService.VerifyAccessToken(tokenString, tenantID)
	if err != nil {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}
	err = h.RBACService.Enforce(claims.Roles, req.Resource, req.Action)
	if err != nil {
		http.Error(w, "access denied", http.StatusForbidden)
		h.AuditLogger.LogEvent("rbac_denied", map[string]interface{}{
			"user_id":    claims.UserID,
			"tenant_id":  claims.TenantID,
			"session_id": claims.SessionID,
			"resource":   req.Resource,
			"action":     req.Action,
			"roles":      claims.Roles,
		})
		return
	}
	h.AuditLogger.LogEvent("rbac_granted", map[string]interface{}{
		"user_id":    claims.UserID,
		"tenant_id":  claims.TenantID,
		"session_id": claims.SessionID,
		"resource":   req.Resource,
		"action":     req.Action,
		"roles":      claims.Roles,
	})
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"result":"granted"}`))
}

// extractBearerToken gets the Bearer token from Authorization header.
func extractBearerToken(r *http.Request) string {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return ""
	}
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return parts[1]
}

// getIP extracts the remote IP address for audit logging.
func getIP(r *http.Request) string {
	ip := r.Header.Get("X-Forwarded-For")
	if ip != "" {
		parts := strings.Split(ip, ",")
		return strings.TrimSpace(parts[0])
	}
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}

// writeJSON writes a JSON response.
func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

// generateSessionID creates a session ID for audit and compliance.
func generateSessionID(userID, tenantID string, now int64) string {
	return strings.Join([]string{userID, tenantID, time.Unix(now, 0).Format(time.RFC3339Nano)}, "-")
}

// signJWT signs claims with ECDSA P-256 using the token package's internal signer.
func signJWT(claims token.Claims, priv *ecdsa.PrivateKey) (string, error) {
	if priv == nil {
		return "", errors.New("nil private key")
	}
	return token.SignClaims(claims, priv)
}

// verifyJWT verifies a JWT with ECDSA P-256 using the token package's internal verifier.
func verifyJWT(tokenString string, pub *ecdsa.PublicKey) (*token.Claims, error) {
	if pub == nil {
		return nil, errors.New("nil public key")
	}
	return token.VerifyClaims(tokenString, pub)
}
