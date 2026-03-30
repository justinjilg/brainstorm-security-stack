// Package tenantconfig provides tenant-specific configuration access.
package tenantconfig

// TenantConfigManager fetches per-tenant configuration.
type TenantConfigManager interface {
	GetConfig(tenantID string) (*TenantConfig, error)
}

// TenantConfig holds configuration for a single tenant.
type TenantConfig struct {
	TenantID   string
	KeyID      string
	AllowedIPs []string
	Roles      []string
}
