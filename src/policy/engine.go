package policy

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"strings"
)

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
	parts := strings.Split(condition, "==")
	if len(parts) != 2 {
		return false
	}
	key := strings.TrimSpace(parts[0])
	value := strings.Trim(strings.TrimSpace(parts[1]), "'\"")
	return metadata[key] == value
}

// mapToCompliance maps a rule ID to compliance frameworks.
func mapToCompliance(ruleID string) []string {
	if strings.HasPrefix(ruleID, "CIS") {
		return []string{"CIS"}
	} else if strings.HasPrefix(ruleID, "SOC2") {
		return []string{"SOC 2"}
	} else if strings.HasPrefix(ruleID, "HIPAA") {
		return []string{"HIPAA"}
	}
	return []string{}
}

// deduplicateFindings deduplicates findings by asset+rule pair.
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
