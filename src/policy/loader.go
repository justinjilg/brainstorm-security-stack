package policy

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"strings"

	"gopkg.in/yaml.v3"
)

// Asset represents a discovered asset from the Asset Discovery module.
type Asset struct {
	ID       string            `json:"id"`
	Metadata map[string]string `json:"metadata"` // Key-value pairs like tags, configurations, etc.
}

// Rule represents a parsed YAML security rule.
type Rule struct {
	ID          string   `yaml:"id" json:"id"`
	Description string   `yaml:"description" json:"description"`
	Conditions  []string `yaml:"conditions" json:"conditions"` // e.g., "metadata['tag'] == 'critical'"
	Severity    string   `yaml:"severity" json:"severity"`     // e.g., "high", "medium", "low"
}

// Finding represents a rule violation for an asset.
type Finding struct {
	AssetID       string   `json:"asset_id"`
	RuleID        string   `json:"rule_id"`
	Description   string   `json:"description"`
	Severity      string   `json:"severity"`
	ComplianceIDs []string `json:"compliance_ids"` // Mapped compliance frameworks
}

// PolicyEngine is the core struct for the Policy Evaluation Engine.
type PolicyEngine struct {
	Rules []Rule
}

// LoadRules loads YAML rules from a file.
func (pe *PolicyEngine) LoadRules(filePath string) error {
	data, err := ioutil.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("failed to read rules file: %w", err)
	}

	var rules []Rule
	if err := yaml.Unmarshal(data, &rules); err != nil {
		return fmt.Errorf("failed to parse rules YAML: %w", err)
	}

	pe.Rules = rules
	return nil
}

// Evaluate evaluates assets against the loaded rules and returns findings.
func (pe *PolicyEngine) Evaluate(assets []Asset) ([]Finding, error) {
	if len(pe.Rules) == 0 {
		return nil, errors.New("no rules loaded for evaluation")
	}

	var findings []Finding
	for _, asset := range assets {
		for _, rule := range pe.Rules {
			matched, err := pe.evaluateRule(asset, rule)
			if err != nil {
				return nil, fmt.Errorf("error evaluating rule %s for asset %s: %w", rule.ID, asset.ID, err)
			}
			if matched {
				findings = append(findings, Finding{
					AssetID:       asset.ID,
					RuleID:        rule.ID,
					Description:   rule.Description,
					Severity:      rule.Severity,
					ComplianceIDs: mapToCompliance(rule.ID),
				})
			}
		}
	}

	return deduplicateFindings(findings), nil
}

// evaluateRule evaluates a single rule against an asset.
func (pe *PolicyEngine) evaluateRule(asset Asset, rule Rule) (bool, error) {
	for _, condition := range rule.Conditions {
		if !evaluateCondition(asset.Metadata, condition) {
			return false, nil
		}
	}
	return true, nil
}

// evaluateCondition evaluates a single condition against asset metadata.
func evaluateCondition(metadata map[string]string, condition string) bool {
	// This is a basic implementation. In production, use a proper expression parser.
	parts := strings.Split(condition, "==")
	if len(parts) != 2 {
		return false
	}
	key := strings.TrimSpace(parts[0])
	value := strings.TrimSpace(parts[1])
	value = strings.Trim(value, "'\"") // Remove quotes around the value

	return metadata[key] == value
}

// mapToCompliance maps a rule ID to compliance frameworks.
func mapToCompliance(ruleID string) []string {
	// Placeholder implementation. In production, use a proper mapping mechanism.
	if strings.HasPrefix(ruleID, "CIS") {
		return []string{"CIS"}
	} else if strings.HasPrefix(ruleID, "SOC2") {
		return []string{"SOC 2"}
	} else if strings.HasPrefix(ruleID, "HIPAA") {
		return []string{"HIPAA"}
	}
	return []string{}
}

// deduplicateFindings deduplicates findings using a simple heuristic.
func deduplicateFindings(findings []Finding) []Finding {
	seen := make(map[string]bool)
	var deduplicated []Finding

	for _, finding := range findings {
		key := fmt.Sprintf("%s:%s", finding.AssetID, finding.RuleID)
		if !seen[key] {
			seen[key] = true
			deduplicated = append(deduplicated, finding)
		}
	}

	return deduplicated
}

// ExportFindings exports findings to a JSON file.
func ExportFindings(findings []Finding, filePath string) error {
	data, err := json.MarshalIndent(findings, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal findings to JSON: %w", err)
	}

	if err := ioutil.WriteFile(filePath, data, 0644); err != nil {
		return fmt.Errorf("failed to write findings to file: %w", err)
	}

	return nil
}

// Example usage:
// func main() {
// 	engine := &PolicyEngine{}
// 	err := engine.LoadRules("rules.yaml")
// 	if err != nil {
// 		fmt.Println("Error loading rules:", err)
// 		return
// 	}

// 	assets := []Asset{
// 		{ID: "asset1", Metadata: map[string]string{"tag": "critical"}},
// 		{ID: "asset2", Metadata: map[string]string{"tag": "non-critical"}},
// 	}

// 	findings, err := engine.Evaluate(assets)
// 	if err != nil {
// 		fmt.Println("Error evaluating assets:", err)
// 		return
// 	}

// 	err = ExportFindings(findings, "findings.json")
// 	if err != nil {
// 		fmt.Println("Error exporting findings:", err)
// 	}
// }
