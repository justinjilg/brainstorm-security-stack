package auth

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// --- Mocks for Interfaces ---

type MockTokenService struct {
	IssueAccessTokenFunc   func(userID string, tenantID string, roles []string, customClaims map[string]interface{}) (accessToken string, refreshToken string, err error)
	VerifyAccessTokenFunc  func(token string, tenantID string) (*Claims, error)
	VerifyRefreshTokenFunc func(token string, tenantID string) (*Claims, error)
	RotateRefreshTokenFunc func(refreshToken string, tenantID string) (newRefreshToken string, err error)
}

func (m *MockTokenService) IssueAccessToken(userID string, tenantID string, roles []string, customClaims map[string]interface{}) (accessToken string, refreshToken string, err error) {
	if m.IssueAccessTokenFunc != nil {
		return m.IssueAccessTokenFunc(userID, tenantID, roles, customClaims)
	}
	return "mock_access_token", "mock_refresh_token", nil
}

func (m *MockTokenService) VerifyAccessToken(token string, tenantID string) (*Claims, error) {
	if m.VerifyAccessTokenFunc != nil {
		return m.VerifyAccessTokenFunc(token, tenantID)
	}
	if token == "valid_access_token" {
		return &Claims{UserID: "user123", TenantID: tenantID, Roles: []string{"user"}, SessionID: "sess123", IssuedBy: "test"}, nil
	}
	return nil, errors.New("invalid token")
}

func (m *MockTokenService) VerifyRefreshToken(token string, tenantID string) (*Claims, error) {
	if m.VerifyRefreshTokenFunc != nil {
		return m.VerifyRefreshTokenFunc(token, tenantID)
	}
	if token == "valid_refresh_token" {
		return &Claims{UserID: "user123", TenantID: tenantID, Roles: []string{"user"}, SessionID: "sess123", IssuedBy: "test"}, nil
	}
	return nil, errors.New("invalid refresh token")
}

func (m *MockTokenService) RotateRefreshToken(refreshToken string, tenantID string) (newRefreshToken string, err error) {
	if m.RotateRefreshTokenFunc != nil {
		return m.RotateRefreshToken
