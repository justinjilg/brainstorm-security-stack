<!-- Agent: quinn-architect | Model: gpt-4o-2024-11-20 | Cost: $0.0218 -->

### Architecture Design: JWT Authentication Handler

---

#### **Component Design**

The JWT Authentication Handler will be implemented as a modular service with the following key components:

1. **TokenService**: Handles issuance, verification, and rotation of JWTs.
2. **RBACService**: Decodes JWTs and enforces role-based access control.
3. **KeyManager**: Manages signing keys securely via integration with an HSM or equivalent.
4. **AuditLogger**: Logs token-related events for compliance and troubleshooting.
5. **TenantConfigManager**: Fetches tenant-specific configurations (e.g., keys, roles) from the Tenant Management System.
6. **API Layer**: Exposes endpoints for token issuance, verification, and refresh.

Each component will be encapsulated in its own Go package to ensure clear boundaries and maintainability.

---

#### **Go Package and Interface Definitions**

1. **`token` Package**
   - Handles JWT issuance, verification, and refresh workflows.

   ```go
   package token

   import (
       "time"
   )

   type TokenService interface {
       IssueAccessToken(userID string, tenantID string, roles []string, customClaims map[string]interface{}) (string, string, error)
       VerifyAccessToken(token string, tenantID string) (*Claims, error)
       RotateRefreshToken(refreshToken string, tenantID string) (string, error)
   }

   type Claims struct {
       UserID    string                 `json:"user_id"`
       TenantID  string                 `json:"tenant_id"`
       Roles     []string               `json:"roles"`
       SessionID string                 `json:"session_id"`
       IssuedBy  string                 `json:"issued_by"`
       Custom    map[string]interface{} `json:"custom"`
       Exp       int64                  `json:"exp"`
       Iat       int64                  `json:"iat"`
       Aud       string                 `json:"aud"`
       Iss       string                 `json:"iss"`
   }

   type TokenConfig struct {
       AccessTokenTTL  time.Duration
       RefreshTokenTTL time.Duration
   }
   ```

2. **`rbac` Package**
   - Enforces RBAC policies based on roles extracted from JWTs.

   ```go
   package rbac

   type RBACService interface {
       Enforce(roles []string, resource string, action string) error
   }
   ```

3. **`keymanager` Package**
   - Manages signing keys securely.

   ```go
   package keymanager

   import "crypto/ecdsa"

   type KeyManager interface {
       GetSigningKey(tenantID string) (*ecdsa.PrivateKey, error)
       GetVerificationKey(tenantID string) (*ecdsa.PublicKey, error)
   }
   ```

4. **`audit` Package**
   - Logs token issuance, refresh, and verification events.

   ```go
   package audit

   type AuditLogger interface {
       LogEvent(eventType string, metadata map[string]interface{}) error
   }
   ```

5. **`tenantconfig` Package**
   - Fetches tenant-specific configurations.

   ```go
   package tenantconfig

   type TenantConfig struct {
       TenantID string
       Roles    []string
       Keys     struct {
           PublicKey  string
           PrivateKey string
       }
   }

   type TenantConfigManager interface {
       GetTenantConfig(tenantID string) (*TenantConfig, error)
   }
   ```

---

#### **Data Model**

1. **JWT Claims (Go Struct)**

   ```go
   type Claims struct {
       UserID    string                 `json:"user_id"`
       TenantID  string                 `json:"tenant_id"`
       Roles     []string               `json:"roles"`
       SessionID string                 `json:"session_id"`
       IssuedBy  string                 `json:"issued_by"`
       Custom    map[string]interface{} `json:"custom"`
       Exp       int64                  `json:"exp"`
       Iat       int64                  `json:"iat"`
       Aud       string                 `json:"aud"`
       Iss       string                 `json:"iss"`
   }
   ```

2. **Database Schema**

   - **RefreshTokenBlacklist**
     - Tracks invalidated refresh tokens.

   ```sql
   CREATE TABLE refresh_token_blacklist (
       token_id VARCHAR(255) PRIMARY KEY,
       tenant_id VARCHAR(255) NOT NULL,
       user_id VARCHAR(255) NOT NULL,
       issued_at TIMESTAMP NOT NULL,
       expires_at TIMESTAMP NOT NULL
   );
   ```

---

#### **API Surface**

1. **POST `/token/issue`**
   - Issues an access token and refresh token.

   **Request:**
   ```json
   {
       "user_id": "12345",
       "tenant_id": "tenant_1",
       "roles": ["security_analyst"],
       "custom_claims": {
           "session_id": "abc123"
       }
   }
   ```

   **Response:**
   ```json
   {
       "access_token": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9...",
       "refresh_token": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9..."
   }
   ```

2. **POST `/token/refresh`**
   - Rotates the refresh token.

   **Request:**
   ```json
   {
       "refresh_token": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9..."
   }
   ```

   **Response:**
   ```json
   {
       "access_token": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9...",
       "refresh_token": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9..."
   }
   ```

3. **POST `/token/verify`**
   - Verifies the access token.

   **Request:**
   ```json
   {
       "access_token": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9..."
   }
   ```

   **Response:**
   ```json
   {
       "valid": true,
       "claims": {
           "user_id": "12345",
           "tenant_id": "tenant_1",
           "roles": ["security_analyst"],
           "session_id": "abc123",
           "exp": 1699999999
       }
   }
   ```

---

#### **Error Handling Strategy**

- **Token Errors**: Return HTTP 401 with specific error codes (`invalid_token`, `expired_token`, `tampered_token`).
- **RBAC Errors**: Return HTTP 403 with `access_denied`.
- **Tenant Errors**: Return HTTP 404 for missing tenant configurations.
- **Internal Errors**: Log details, return HTTP 500 with generic `internal_error`.

---

#### **Integration Points**

1. **Key Management Service**: Securely fetch signing keys.
2. **Tenant Management System**: Retrieve tenant-specific configurations.
3. **Audit Logging Framework**: Log token-related events.
4. **RBAC Policy Engine**: Enforce role-based access control.

---

#### **ASCII Architecture Diagram**

```
+-------------------+       +-----------------------+
|   API Layer       |       |  TenantConfigManager |
| /token/issue      |<----->|  Fetch tenant keys   |
| /token/refresh    |       |  and roles           |
| /token/verify     |       +-----------------------+
+--------+----------+
         |
         v
+-------------------+       +-----------------------+
|   TokenService    |<----->|  KeyManager          |
| Issue, Verify,    |       |  Manage keys via HSM |
| Rotate Tokens     |       +-----------------------+
+--------+----------+
         |
         v
+-------------------+       +-----------------------+
|   RBACService     |<----->|  AuditLogger         |
| Enforce Policies  |       |  Log events          |
+-------------------+       +-----------------------+
```

---

This design ensures modularity, tenant isolation, and compliance with the given spec. Each component is independently testable, and the architecture supports horizontal scaling.
