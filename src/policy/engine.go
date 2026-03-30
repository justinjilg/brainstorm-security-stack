<!-- Agent: quinn-architect | Model: gpt-4.1-2025-04-14 | Cost: $0.0338 | Latency: 214742ms -->
<!-- Route: explicit | Quality: 0.76 | Reputation: gold -->
<!-- Budget remaining: $49.89 -->
Absolutely. Here’s how I’d approach the initial Go implementation of the Policy Engine core logic, following the schema in `src/policy/schema.yaml` and the modular monolith boundaries in [ADR-001](docs/architecture/system-design-v1.md).

# Design Approach

- **Policy Definition:** Parse YAML policy files into Go structs.
- **Resource Model:** Accept normalized resource data as `map[string]interface{}` (future: strong types per provider).
- **Evaluation:** For each resource, determine if a policy applies (selector), then evaluate its condition.
- **Extensibility:**  
  - New providers/resources: add to selector logic, not core engine.
  - New condition operators: add to condition evaluation.

# Directory Structure (suggested)

```
policy/
  engine.go
  types.go
  loader.go
  evaluator.go
  operators.go
  testdata/
    aws-s3-public-bucket.yaml
```

# Implementation

Below is a single-file version for clarity, but in practice, I’d split this into the files above.

```go
package policy

import (
    "errors"
    "fmt"
    "io/ioutil"
    "gopkg.in/yaml.v3"
    "regexp"
    "reflect"
)

// --- types.go ---

// Policy represents a single policy definition.
type Policy struct {
    ID          string        `yaml:"id"`
    Name        string        `yaml:"name"`
    Description string        `yaml:"description"`
    Provider    string        `yaml:"provider"`
    Resource    string        `yaml:"resource"`
    Selector    Selector      `yaml:"selector"`
    Condition   Condition     `yaml:"condition"`
    Compliance  []Compliance  `yaml:"compliance"`
    Remediation Remediation   `yaml:"remediation"`
    Metadata    Metadata      `yaml:"metadata"`
}

type Selector struct {
    AccountTypes  []string     `yaml:"account_types"`
    ResourceTypes []string     `yaml:"resource_types"`
    Filters       []Filter     `yaml:"filters"`
}

type Filter struct {
    Field   string `yaml:"field"`
    Pattern string `yaml:"pattern"`
}

type Condition map[string]interface{}

type Compliance struct {
    Framework   string `yaml:"framework"`
    ControlID   string `yaml:"control_id"`
    Description string `yaml:"description"`
}

type Remediation struct {
    Summary          string   `yaml:"summary"`
    Steps            []string `yaml:"steps"`
    CLIExample       string   `yaml:"cli_example"`
    DocumentationURL string   `yaml:"documentation_url"`
    Risk             string   `yaml:"risk"`
}

type Metadata struct {
    Severity string `yaml:"severity"`
    Enabled  bool   `yaml:"enabled"`
    Version  string `yaml:"version"`
}

// --- loader.go ---

// LoadPolicies loads all policies from a given YAML file or directory (single file for now).
func LoadPolicies(path string) ([]Policy, error) {
    data, err := ioutil.ReadFile(path)
    if err != nil {
        return nil, err
    }
    var p Policy
    if err := yaml.Unmarshal(data, &p); err != nil {
        return nil, err
    }
    return []Policy{p}, nil
}

// --- engine.go ---

// Resource is a normalized cloud asset (from Scanner Engine).
type Resource map[string]interface{}

// PolicyEngine evaluates policies against resources.
type PolicyEngine struct {
    Policies []Policy
}

// NewPolicyEngine creates a new engine with loaded policies.
func NewPolicyEngine(policies []Policy) *PolicyEngine {
    return &PolicyEngine{Policies: policies}
}

// EvaluateResource evaluates all policies against a resource, returns triggered findings.
func (e *PolicyEngine) EvaluateResource(resource Resource) ([]Finding, error) {
    var findings []Finding
    for _, policy := range e.Policies {
        if !policy.Metadata.Enabled {
            continue
        }
        if !policyApplies(policy, resource) {
            continue
        }
        ok, err := evalCondition(policy.Condition, resource)
        if err != nil {
            return nil, fmt.Errorf("policy %s: %w", policy.ID, err)
        }
        if ok {
            findings = append(findings, Finding{
                PolicyID:    policy.ID,
                ResourceID:  getResourceID(resource),
                PolicyName:  policy.Name,
                Description: policy.Description,
                Compliance:  policy.Compliance,
                Remediation: policy.Remediation,
                Severity:    policy.Metadata.Severity,
            })
        }
    }
    return findings, nil
}

// --- evaluator.go ---

// policyApplies checks if the selector matches the resource.
func policyApplies(policy Policy, resource Resource) bool {
    // Check provider/resource type
    acctType, _ := resource["account_type"].(string)
    resType, _ := resource["resource_type"].(string)
    if !contains(policy.Selector.AccountTypes, acctType) {
        return false
    }
    if !contains(policy.Selector.ResourceTypes, resType) {
        return false
    }
    // Filters (field pattern)
    for _, f := range policy.Selector.Filters {
        val, _ := resource[f.Field].(string)
        if val == "" {
            return false
        }
        matched, _ := regexp.MatchString(f.Pattern, val)
        if !matched {
            return false
        }
    }
    return true
}

func contains(list []string, s string) bool {
    for _, v := range list {
        if v == s {
            return true
        }
    }
    return false
}

// --- operators.go ---

// evalCondition recursively evaluates the condition tree.
func evalCondition(cond Condition, resource Resource) (bool, error) {
    // Handle compound operators: any, all
    if any, ok := cond["any"]; ok {
        arr, ok := any.([]interface{})
        if !ok {
            return false, errors.New("invalid 'any' array")
        }
        for _, c := range arr {
            sub, ok := c.(map[string]interface{})
            if !ok {
                return false, errors.New("invalid 'any' sub-condition")
            }
            ok, err := evalCondition(sub, resource)
            if err != nil {
                return false, err
            }
            if ok {
                return true, nil
            }
        }
        return false, nil
    }
    if all, ok := cond["all"]; ok {
        arr, ok := all.([]interface{})
        if !ok {
            return false, errors.New("invalid 'all' array")
        }
        for _, c := range arr {
            sub, ok := c.(map[string]interface{})
            if !ok {
                return false, errors.New("invalid 'all' sub-condition")
            }
            ok, err := evalCondition(sub, resource)
            if err != nil {
                return false, err
            }
            if !ok {
                return false, nil
            }
        }
        return true, nil
    }
    // Simple operators: field, equals, not_equals, etc.
    field, ok := cond["field"].(string)
    if !ok {
        return false, errors.New("missing field")
    }
    val, exists := resource[field]
    if !exists {
        return false, nil // field missing, treat as not matched
    }
    // equals
    if eq, ok := cond["equals"]; ok {
        return reflect.DeepEqual(val, eq), nil
    }
    // not_equals
    if neq, ok := cond["not_equals"]; ok {
        return !reflect.DeepEqual(val, neq), nil
    }
    // greater_than
    if gt, ok := cond["greater_than"]; ok {
        return compare(val, gt) > 0, nil
    }
    // less_than
    if lt, ok := cond["less_than"]; ok {
        return compare(val, lt) < 0, nil
    }
    // contains
    if containsVal, ok := cond["contains"]; ok {
        arr, ok := val.([]interface{})
        if !ok {
            return false, nil
        }
        for _, v := range arr {
            if reflect.DeepEqual(v, containsVal) {
                return true, nil
            }
        }
        return false, nil
    }
    // regex
    if pattern, ok := cond["regex"]; ok {
        s, ok := val.(string)
        if !ok {
            return false, nil
        }
        matched, err := regexp.MatchString(fmt.Sprintf("%v", pattern), s)
        return matched, err
    }
    // in
    if inVals, ok := cond["in"]; ok {
        arr, ok := inVals.([]interface{})
        if !ok {
            return false, nil
        }
        for _, v := range arr {
            if reflect.DeepEqual(val, v) {
                return true, nil
            }
        }
        return false, nil
    }
    return false, errors.New("unsupported operator")
}

// compare tries to compare two values as float64.
func compare(a, b interface{}) int {
    fa, ok1 := toFloat(a)
    fb, ok2 := toFloat(b)
    if !ok1 || !ok2 {
        return 0
    }
    if fa > fb {
        return 1
    }
    if fa < fb {
        return -1
    }
    return 0
}

func toFloat(v interface{}) (float64, bool) {
    switch t := v.(type) {
    case int:
        return float64(t), true
    case int64:
        return float64(t), true
    case float64:
        return t, true
    case float32:
        return float64(t), true
    default:
        return 0, false
    }
}

// --- findings.go ---

type Finding struct {
    PolicyID    string
    ResourceID  string
    PolicyName  string
    Description string
    Compliance  []Compliance
    Remediation Remediation
    Severity    string
}

// getResourceID extracts a unique resource ID (customize as needed).
func getResourceID(resource Resource) string {
    if id, ok := resource["id"].(string); ok {
        return id
    }
    if arn, ok := resource["arn"].(string); ok {
        return arn
    }
    return ""
}
```

# Usage Example

```go
policies, err := policy.LoadPolicies("testdata/aws-s3-public-bucket.yaml")
engine := policy.NewPolicyEngine(policies)
resource := policy.Resource{
    "account_type": "aws",
    "resource_type": "s3_bucket",
    "arn": "arn:aws:s3:::my-bucket",
    "public_read": true,
    "public_write": false,
}
findings, err := engine.EvaluateResource(resource)
```

# Extensibility

- **New Providers:**  
  Add resource normalization in Scanner Engine; selectors/conditions remain unchanged.
- **New Operators:**  
  Add more cases in `evalCondition`.
- **Bulk Evaluation:**  
  Add `EvaluateResources([]Resource)` for batch mode.

# Summary

This core logic matches the schema and system design. It’s modular (split by concern), extensible (new operators/providers), and easy for the rest of the system to call. The next steps would be:  
- Add unit tests for all operators and selector logic  
- Integrate with the scanner’s resource model  
- Validate policy YAMLs at load time

Let me know if you want this split into multiple files or with more advanced error handling!
