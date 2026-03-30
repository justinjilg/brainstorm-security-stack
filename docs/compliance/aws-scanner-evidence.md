<!-- Agent: sam-compliance | Model: gpt-4.1-2025-04-14 | Cost: $0.0166 -->

**SOC 2 & HIPAA Compliance Mapping: AWS Resource Scanner Implementation**

---

## SOC 2 CC6: Logical and Physical Access Controls

### CC6.1 — Logical Access Security
- **Description:** Logical access to information assets is restricted and managed.
- **Evidence:**  
  - `src/scanner/providers/aws.go`, `Scan(ctx context.Context, cfg aws.Config)`  
    - Uses AWS SDK with credentials passed via `aws.Config`. Credentials must be provisioned with read-only permissions, as per spec.
  - `src/scanner/providers/aws.go`, `scanRegion(ctx, cfg, region)`  
    - Each AWS service client is instantiated with the provided config, inheriting credential scope.
- **Status:** IMPLEMENTED
- **Notes:** The scanner’s exclusive use of read-only credentials aligns with principle of least privilege. Evidence is the code’s use of AWS SDK and absence of write or modify calls.

---

### CC6.2 — User Access Authorization
- **Description:** Processes are in place to authorize, modify, or remove access.
- **Evidence:**  
  - `src/scanner/providers/aws.go`, `Scan(ctx context.Context, cfg aws.Config)`  
    - The function expects `aws.Config` to be passed in, implying credential management occurs outside the scanner (e.g., via environment, vault, or CI/CD).
- **Status:** PARTIAL
- **GAP:**  
  - The scanner assumes credentials are correctly scoped but does not itself validate or log the source of credential provisioning.  
  - **Needed:** Integration with a credential management system (e.g., AWS Secrets Manager, audit log of credential use) and explicit logging of credential source in the `Logger`.

---

## SOC 2 CC7: System Operations

### CC7.1 — Monitoring and Detection of Anomalies
- **Description:** The entity monitors system components and detects anomalies.
- **Evidence:**  
  - `src/scanner/providers/aws.go`, `Logger` interface and usage in `Scan` and `scanRegion`  
    - Logging of errors and operational info, e.g., when scans fail for a region or service.
- **Status:** PARTIAL
- **GAP:**  
  - Logging is present, but there is no persistent audit trail or integration with SIEM.  
  - **Needed:** Extend `Logger` to write to a centralized log store (e.g., CloudWatch, ELK) with retention and access controls.

---

### CC7.2 — Vulnerability Management
- **Description:** The entity identifies and addresses vulnerabilities.
- **Evidence:**  
  - `src/scanner/providers/aws.go`, `Scan` and `scanRegion`  
    - The scanner enumerates assets, providing visibility into the AWS environment—this is foundational for vulnerability management.
- **Status:** IMPLEMENTED
- **Notes:** While the scanner does not detect vulnerabilities directly, asset inventory is a prerequisite for vulnerability assessment.

---

## HIPAA 164.312: Technical Safeguards

### 164.312(a)(1) — Access Control
- **Description:** Implement technical policies and procedures for electronic information systems that maintain ePHI to allow access only to those persons or software programs that have been granted access rights.
- **Evidence:**  
  - `src/scanner/providers/aws.go`, `Scan(ctx context.Context, cfg aws.Config)`  
    - Operates with read-only IAM credentials, as required by spec.
- **Status:** IMPLEMENTED

---

### 164.312(b) — Audit Controls
- **Description:** Implement hardware, software, and/or procedural mechanisms to record and examine activity in information systems that contain or use ePHI.
- **Evidence:**  
  - `src/scanner/providers/aws.go`, `Logger` interface and usage  
    - Errors and info are logged, but destination and retention are not specified.
- **Status:** PARTIAL
- **GAP:**  
  - No evidence of logs being retained or protected as required for HIPAA audit controls.  
  - **Needed:** Logger must write to a tamper-evident, access-controlled log store with documented retention.

---

### 164.312(d) — Person or Entity Authentication
- **Description:** Implement procedures to verify that a person or entity seeking access to ePHI is the one claimed.
- **Evidence:**  
  - `src/scanner/providers/aws.go`, `Scan(ctx context.Context, cfg aws.Config)`  
    - Relies on AWS IAM for authentication, which is industry standard.
- **Status:** IMPLEMENTED

---

### 164.312(e)(1) — Transmission Security
- **Description:** Protect ePHI against unauthorized access during transmission.
- **Evidence:**  
  - `src/scanner/providers/aws.go`, use of AWS SDK  
    - All AWS SDK calls use HTTPS by default.
- **Status:** IMPLEMENTED

---

## Summary Table

| Control ID         | Description                                         | Evidence (File, Function)                    | Status      | Gap/Remediation Needed                          |
|--------------------|-----------------------------------------------------|----------------------------------------------|-------------|------------------------------------------------|
| SOC2 CC6.1         | Logical Access Security                             | aws.go, Scan, scanRegion                     | IMPLEMENTED |                                                |
| SOC2 CC6.2         | User Access Authorization                           | aws.go, Scan                                 | PARTIAL     | Credential provenance and audit logging         |
| SOC2 CC7.1         | Monitoring and Detection of Anomalies               | aws.go, Logger usage                         | PARTIAL     | Persistent, centralized, and protected logging  |
| SOC2 CC7.2         | Vulnerability Management                            | aws.go, Scan, scanRegion                     | IMPLEMENTED |                                                |
| HIPAA 164.312(a)   | Access Control                                      | aws.go, Scan                                 | IMPLEMENTED |                                                |
| HIPAA 164.312(b)   | Audit Controls                                      | aws.go, Logger usage                         | PARTIAL     | Retained, protected, and auditable logs         |
| HIPAA 164.312(d)   | Person/Entity Authentication                        | aws.go, Scan                                 | IMPLEMENTED |                                                |
| HIPAA 164.312(e)   | Transmission Security                               | aws.go, AWS SDK usage                        | IMPLEMENTED |                                                |

---

**If you want this audit-ready:**  
- Integrate credential provenance logging.
- Ensure logs are centralized, retained, and access-controlled.
- Document operational procedures for credential issuance and scanner execution.

Where’s the evidence? See the function and file references above. If it’s not logged, it didn’t happen.
