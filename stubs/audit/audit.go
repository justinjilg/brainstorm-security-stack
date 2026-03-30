// Package audit provides structured audit logging for compliance.
package audit

// AuditLogger records security-relevant events.
type AuditLogger interface {
	LogEvent(event string, data map[string]interface{})
}
