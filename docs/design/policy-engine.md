<!-- Agent: quinn-architect | Model: gpt-4o-2024-11-20 | Cost: $0.0192 -->

### Architecture Design: Policy Evaluation Engine

---

#### **1. Component Design**

The Policy Evaluation Engine will be implemented as a modular service, with clear separation of concerns for rule parsing, evaluation, compliance mapping, deduplication, and reporting. The service will be written in Go, leveraging idiomatic patterns for concurrency and performance.

##### **Core Components and Packages**

1. **`rules` Package**
   - Handles parsing and validation of YAML rules.
   - Defines the interface for rule evaluation.

2. **`evaluation` Package**
   - Evaluates assets against parsed rules.
   - Outputs raw findings.

3. **`compliance` Package**
   - Maps findings to compliance frameworks (CIS, SOC 2, HIPAA).

4. **`deduplication` Package**
   - Uses `pgvector` embeddings to deduplicate findings.

5. **`reporting` Package**
   - Formats and exports findings as JSON.
   - Provides API endpoints for external access.

6. **`logging` Package**
   - Centralized logging for errors, warnings, and operational metrics.

7. **`security` Package**
   - Validates and sanitizes YAML inputs.
   - Enforces RBAC for API access.

---

#### **2. Data Model**

##### **Structs**

```go
// Asset represents a discovered asset from the Asset Discovery module.
type Asset struct {
    ID          string            `json:"id"`
    Metadata    map[string]string `json:"metadata"` // Key-value pairs like tags, configurations, etc.
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
    ViolatedRules []string `json:"violated_rules"` // List of rule IDs
    Compliance    []string `json:"compliance"`     // List of compliance control IDs
    IsDuplicate   bool     `json:"is_duplicate"`
    Similarity    float64  `json:"similarity"`     // Similarity score for deduplication
}

// ComplianceMapping represents the mapping of a rule to compliance controls.
type ComplianceMapping struct {
    RuleID       string   `json:"rule_id"`
    Framework    string   `json:"framework"` // e.g., "CIS", "SOC 2", "HIPAA"
    ControlIDs   []string `json:"control_ids"`
    Description  string   `json:"description"`
}
```

##### **Database Schema**

```sql
-- Table: assets
CREATE TABLE assets (
    id UUID PRIMARY KEY,
    metadata JSONB NOT NULL
);

-- Table: rules
CREATE TABLE rules (
    id UUID PRIMARY KEY,
    description TEXT NOT NULL,
    conditions JSONB NOT NULL,
    severity TEXT NOT NULL
);

-- Table: compliance_mappings
CREATE TABLE compliance_mappings (
    rule_id UUID REFERENCES rules(id),
    framework TEXT NOT NULL,
    control_ids TEXT[] NOT NULL,
    description TEXT NOT NULL
);

-- Table: findings
CREATE TABLE findings (
    id UUID PRIMARY KEY,
    asset_id UUID REFERENCES assets(id),
    violated_rules UUID[] NOT NULL,
    compliance TEXT[] NOT NULL,
    is_duplicate BOOLEAN NOT NULL,
    similarity FLOAT NOT NULL
);

-- Table: embeddings (for deduplication)
CREATE TABLE embeddings (
    finding_id UUID REFERENCES findings(id),
    vector VECTOR(1536) NOT NULL
);
```

---

#### **3. API Surface**

##### **Endpoints**

1. **Evaluate Assets**
   - **POST** `/api/v1/evaluate`
   - **Request:**
     ```json
     {
         "assets": [
             {
                 "id": "asset-123",
                 "metadata": {
                     "tag": "critical",
                     "configuration": "default"
                 }
             }
         ]
     }
     ```
   - **Response:**
     ```json
     {
         "findings": [
             {
                 "asset_id": "asset-123",
                 "violated_rules": ["rule-1", "rule-2"],
                 "compliance": ["CIS-1.1", "SOC2-2.3"],
                 "is_duplicate": false,
                 "similarity": 0.0
             }
         ]
     }
     ```

2. **Get Compliance Mappings**
   - **GET** `/api/v1/compliance`
   - **Response:**
     ```json
     {
         "mappings": [
             {
                 "rule_id": "rule-1",
                 "framework": "CIS",
                 "control_ids": ["CIS-1.1", "CIS-1.2"],
                 "description": "Ensure secure configuration for XYZ."
             }
         ]
     }
     ```

3. **Export Findings**
   - **GET** `/api/v1/findings/export`
   - **Response:** JSON file download.

---

#### **4. Error Handling Strategy**

1. **YAML Parsing Errors**
   - Log errors with line numbers and descriptions.
   - Example:
     ```
     ERROR: Invalid YAML rule at line 12: "unexpected character '@'"
     ```

2. **Deduplication Threshold Misconfiguration**
   - Validate thresholds during initialization.
   - Example:
     ```
     ERROR: Deduplication threshold must be between 0.0 and 1.0.
     ```

3. **Asset Metadata Validation**
   - Reject assets with missing or invalid metadata.
   - Example:
     ```
     ERROR: Asset ID "asset-123" has missing "tag" field.
     ```

4. **RBAC Violations**
   - Return `403 Forbidden` for unauthorized API access.

---

#### **5. Integration Points**

1. **Asset Discovery Module**
   - Integration via API to fetch discovered assets.

2. **Policy Management Module**
   - Integration via API or direct database access to fetch YAML rules and compliance mappings.

3. **PostgreSQL with `pgvector`**
   - Used for storing and querying embeddings for deduplication.

4. **Authentication and Authorization**
   - Use an external service (e.g., OAuth2) for RBAC enforcement.

---

#### **6. ASCII Architecture Diagram**

```
+--------------------+
|  Asset Discovery   |
+--------------------+
         |
         v
+--------------------+       +-----------------------+
|  Policy Evaluation |<----->|  Policy Management    |
|      Engine        |       |  (YAML Rules, Mapping)|
+--------------------+       +-----------------------+
         |
         v
+--------------------+       +-----------------------+
|  PostgreSQL DB     |<----->|  Authentication/RBAC  |
|  (Assets, Rules,   |       +-----------------------+
|   Findings, Embeds)|
+--------------------+
         |
         v
+--------------------+
|  Reporting Module  |
+--------------------+
```

---

This architecture ensures modularity, scalability, and security while meeting the functional and non-functional requirements of the Policy Evaluation Engine.
