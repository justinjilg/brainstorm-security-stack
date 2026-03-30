package policy

import (
	"fmt"
	"io/ioutil"

	"gopkg.in/yaml.v3"
)

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
