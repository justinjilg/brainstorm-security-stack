<!-- Agent: quinn-architect | Model: gpt-4.1-2025-04-14 | Cost: $0.0000 -->

```
+-------------------+
|    CLI Layer      |  <-- cmd/aws-resource-scanner
+---------+---------+
          |
          v
+---------+---------+
|   Scanner Core    |  <-- internal/scanner
+---------+---------+
          |
          v
+---------+---------+      +---------------------+
|  AWS Service     |<---->| AWS SDK (aws-sdk-go) |
|  Adapters        |      +---------------------+
| (internal/aws)   |
+---------+---------+
          |
          v
+---------+---------+
| Normalizer Layer  |  <-- internal/normalize
+---------+---------+
          |
          v
+---------+---------+
| Output Writer     |  <-- internal/output
+---------+---------+
          |
          v
+---------+---------+
| Logging Framework |  <-- internal/log
+-------------------+
```

---

# 1. Component Design — Go Packages & Interfaces

### 1.1. `cmd/aws-resource-scanner`

- Entrypoint, CLI parsing, wiring dependencies.

### 1.2. `internal/scanner`

- Orchestrates scan, manages worker pool, error aggregation.

```go
type Scanner struct {
    AWSClients   aws.ClientFactory
    Normalizer   normalize.Normalizer
    OutputWriter output.Writer
    Logger       log.Logger
    Workers      int
    Regions      []string
    Services     []string
}

func (s *Scanner) Run(ctx context.Context, creds aws.Credentials, opts ScanOptions) error

type ScanOptions struct {
    Regions  []string
    Workers  int
    Services []string // e.g. ["ec2", "s3", ...]
}
```

### 1.3. `internal/aws`

- Service-specific adapters, all implement common interface.

```go
type ResourceAdapter interface {
    ListResources(ctx context.Context, region string) ([]aws.RawResource, error)
    ServiceName() string
}

type ClientFactory interface {
    EC2(region string) EC2Client
    S3(region string) S3Client
    IAM(region string) IAMClient
    RDS(region string) RDSClient
    Lambda(region string) LambdaClient
    // Credentials management
}

type RawResource struct {
    ID       string
    Type     string
    Region   string
    Tags     map[string]string
    Owner    string
    Metadata map[string]any
}
```

### 1.4. `internal/normalize`

- Maps AWS-specific resource structs to common Asset.

```go
type Normalizer interface {
    Normalize(raw aws.RawResource) (Asset, error)
}
```

### 1.5. `internal/output`

- Handles writing output JSON, scan metadata.

```go
type Writer interface {
    Write(assets []Asset, meta ScanMetadata) error
}

type ScanMetadata struct {
    StartTime time.Time
    EndTime   time.Time
    Duration  time.Duration
    ErrorSummary []ErrorInfo
}
```

### 1.6. `internal/log`

- Centralized logging, error masking.

```go
type Logger interface {
    Info(msg string, fields ...any)
    Warn(msg string, fields ...any)
    Error(msg string, fields ...any)
}
```

---

# 2. Data Model

### 2.1. Asset Struct

```go
type Asset struct {
    AssetID  string            `json:"asset_id"`
    Type     string            `json:"type"`
    Region   string            `json:"region"`
    Tags     map[string]string `json:"tags"`
    Owner    string            `json:"owner"`
    Metadata map[string]any    `json:"metadata"`
}
```

### 2.2. Error Info

```go
type ErrorInfo struct {
    Service string `json:"service"`
    Region  string `json:"region"`
    Error   string `json:"error"`
}
```

### 2.3. Output JSON Schema

```json
{
  "scan_metadata": {
    "start_time": "2024-06-01T12:00:00Z",
    "end_time": "2024-06-01T12:09:59Z",
    "duration": "9m59s",
    "error_summary": [
      {
        "service": "ec2",
        "region": "us-west-2",
        "error": "AccessDenied"
      }
    ]
  },
  "assets": [
    {
      "asset_id": "i-1234abcd",
      "type": "ec2_instance",
      "region": "us-west-2",
      "tags": {"Name": "web-server"},
      "owner": "alice@example.com",
      "metadata": {"state": "running", "instance_type": "t3.micro"}
    }
  ]
}
```

---

# 3. API Surface

### 3.1. CLI

- `aws-resource-scanner --credentials <path> --region <regions> --workers <N> --output <file>`

### 3.2. Internal API

- `Scanner.Run(ctx, creds, opts) error`
- `ResourceAdapter.ListResources(ctx, region) ([]RawResource, error)`
- `Normalizer.Normalize(raw) (Asset, error)`
- `Writer.Write(assets, meta) error`

### 3.3. No external HTTP API — CLI tool only.

---

# 4. Error Handling Strategy

- **Per-resource error isolation:** Each resource fetch is wrapped; errors are logged with context, not fatal.
- **Error aggregation:** All errors collected in `[]ErrorInfo` and included in output metadata.
- **Retry logic:** Transient AWS errors (e.g., throttling, network) retried with exponential backoff (max 3 attempts, jittered).
- **Credential validation:** On startup, test permissions for all services/regions; if insufficient, log and skip, do not abort entire scan.
- **Sensitive info masking:** All log messages redact credential values (`AKIA...` → `AKIA****`).
- **Graceful shutdown:** On fatal error (e.g., invalid credentials file), log and exit non-zero.

---

# 5. Integration Points

- **Common Asset Struct:** Imports `Asset` from shared package if available (else defined locally).
- **Logging Framework:** Uses centralized logging interface; supports pluggable log sinks.
- **Credential Management:** Loads credentials from file or env, never persists; supports integration with secrets manager via interface.
- **Downstream Systems:** Output JSON is consumed by downstream asset processors.

---

# 6. ASCII Architecture Diagram

```
+------------------------------+
|         CLI Layer            |   <-- cmd/aws-resource-scanner
+--------------+---------------+
               |
               v
+--------------+---------------+
|         Scanner Core         |   <-- internal/scanner
|  - Worker Pool               |
|  - Error Aggregation         |
+--------------+---------------+
               |
               v
+--------------+---------------+
|      AWS Service Adapters    |   <-- internal/aws
|  - EC2Adapter                |
|  - S3Adapter                 |
|  - IAMAdapter                |
|  - RDSAdapter                |
|  - LambdaAdapter             |
+--------------+---------------+
               |
               v
+--------------+---------------+
|      Normalizer Layer        |   <-- internal/normalize
+--------------+---------------+
               |
               v
+--------------+---------------+
|      Output Writer           |   <-- internal/output
+--------------+---------------+
               |
               v
+--------------+---------------+
|   Logging Framework          |   <-- internal/log
+------------------------------+
```

---

# Trade-offs

- **Worker Pool:** Gains concurrency, but must throttle to avoid AWS rate limits. Chosen for performance; risk of throttling mitigated by backoff.
- **Adapters per Service:** Modular, easier to extend, but more code to maintain. Chosen for clarity and separation of concerns.
- **No HTTP API:** Simpler, but less flexible for integration; CLI output is sufficient for current use case.
- **Error Aggregation:** Errors do not halt scan, but may mask systemic failures if not monitored. Chosen for resilience.

---

# What Happens When This Fails?

- **Credential Failure:** Scan aborts, logs error, no output file written.
- **Partial Permissions:** Only accessible resources scanned; errors logged and reported in summary.
- **API Throttling:** Retries with backoff; if persistent, errors logged and scan continues.
- **Output Write Failure:** Fatal; scan results lost, error logged.
- **Downstream Asset Schema Change:** Scanner must be updated to match new `Asset` definition.

---

# Summary

- Modular, testable Go architecture.
- Explicit boundaries for scanning, normalization, output.
- Resilient to AWS errors and partial permissions.
- CLI-driven, no persistent credentials, output ready for downstream processing.
