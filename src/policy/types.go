package policy

// Asset represents a discovered asset from the Asset Discovery module.
type Asset struct {
	ID       string            `json:"id"`
	Metadata map[string]string `json:"metadata"`
}

// Rule represents a parsed YAML security rule.
type Rule struct {
	ID          string   `yaml:"id" json:"id"`
	Description string   `yaml:"description" json:"description"`
	Conditions  []string `yaml:"conditions" json:"conditions"`
	Severity    string   `yaml:"severity" json:"severity"`
}

// Finding represents a rule violation for an asset.
type Finding struct {
	AssetID       string   `json:"asset_id"`
	RuleID        string   `json:"rule_id"`
	Description   string   `json:"description"`
	Severity      string   `json:"severity"`
	ComplianceIDs []string `json:"compliance_ids"`
}

// PolicyEngine is the core struct for the Policy Evaluation Engine.
type PolicyEngine struct {
	Rules []Rule
}
