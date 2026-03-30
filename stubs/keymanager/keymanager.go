// Package keymanager provides cryptographic key management.
package keymanager

import "crypto/ecdsa"

// KeyManager manages signing and verification keys per tenant.
type KeyManager interface {
	GetSigningKey(tenantID string) (*ecdsa.PrivateKey, error)
	GetVerificationKey(tenantID string) (*ecdsa.PublicKey, error)
	RotateKey(tenantID string) error
}
