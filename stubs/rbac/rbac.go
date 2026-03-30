// Package rbac provides role-based access control enforcement.
package rbac

// RBACService enforces RBAC policies based on roles extracted from JWTs.
type RBACService interface {
	Enforce(roles []string, resource, action string) error
}
