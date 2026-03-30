// Package token provides JWT issuance, verification, and rotation.
// This is a stub package; real implementations live in the main module.
package token

import (
	"crypto/ecdsa"
	"time"
)

// Claims represents JWT claims for multi-tenant access.
type Claims struct {
	UserID       string                 `json:"user_id"`
	TenantID     string                 `json:"tenant_id"`
	Roles        []string               `json:"roles"`
	SubTenantIDs []string               `json:"sub_tenant_ids,omitempty"`
	SessionID    string                 `json:"session_id"`
	IssuedBy     string                 `json:"issued_by"`
	Custom       map[string]interface{} `json:"custom,omitempty"`
	Exp          int64                  `json:"exp"`
	Iat          int64                  `json:"iat"`
	Aud          string                 `json:"aud"`
	Iss          string                 `json:"iss"`
}

// TokenConfig holds JWT configuration parameters.
type TokenConfig struct {
	AccessTokenTTL  time.Duration
	RefreshTokenTTL time.Duration
	Issuer          string
	Audience        string
}

// TokenService handles JWT lifecycle operations.
type TokenService interface {
	IssueAccessToken(userID, tenantID string, roles []string, customClaims map[string]interface{}) (accessToken, refreshToken string, err error)
	VerifyAccessToken(token, tenantID string) (*Claims, error)
	RotateRefreshToken(refreshToken, tenantID string) (string, error)
}

// SignClaims signs JWT claims with ECDSA P-256.
func SignClaims(claims Claims, priv *ecdsa.PrivateKey) (string, error) {
	return "", nil // stub
}

// VerifyClaims verifies a JWT token string with ECDSA P-256.
func VerifyClaims(tokenString string, pub *ecdsa.PublicKey) (*Claims, error) {
	return nil, nil // stub
}
