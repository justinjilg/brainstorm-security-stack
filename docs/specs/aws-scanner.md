<!-- Agent: sage-pm | Model: gpt-4o-2024-11-20 | Cost: $0.0120 -->

# AWS Resource Scanner Specification

## Purpose and Scope

The AWS Resource Scanner is a tool designed to enumerate AWS resources across multiple services (EC2, S3, IAM, RDS, Lambda) using read-only credentials. The scanner will normalize discovered resources into a common `Asset` struct format for further processing by downstream systems. It will support concurrent scanning using a worker pool to optimize performance for large AWS accounts.

This feature is intended for integration into the Living Case Study MSP Security Stack to provide visibility into customer AWS environments. It is not responsible for resource remediation or detailed configuration analysis.

---

## Functional Requirements

1. **Resource Enumeration**
   - Enumerate resources from the following AWS services:
     - EC2: Instances, AMIs, Security Groups, Elastic IPs.
     - S3: Buckets.
     - IAM: Users, Roles, Policies.
     - RDS: Databases, Snapshots.
     - Lambda: Functions.
   - Use AWS SDKs or APIs for resource discovery.

2. **Read-Only Credential Support**
   - Operate exclusively with AWS IAM credentials that have read-only permissions for the above services.
   - Validate credential scope at runtime and fail gracefully if permissions are insufficient.

3. **Normalization**
   - Map all discovered resources into a common `Asset` struct format:
     - Fields: `AssetID`, `Type`, `Region`, `Tags`, `Owner`, `Metadata`.
   - Ensure consistent field population across all resource types.

4. **Concurrency**
   - Use a worker pool to scan resources concurrently.
   - Allow configuration of the worker pool size via a parameter (e.g., `--workers`).

5. **Error Handling**
   - Log errors for individual resource queries without halting the entire scan.
   - Provide a summary of errors at the end of the scan.

6. **Output**
   - Generate a JSON file containing all normalized assets.
   - Include metadata such as scan start time, end time, and duration.

7. **CLI Interface**
   - Provide a command-line interface with the following options:
     - `--credentials`: Path to AWS credentials file.
     - `--region`: Specific AWS region(s) to scan (default: all available).
     - `--workers`: Number of concurrent workers.
     - `--output`: Path to output JSON file.

---

## Non-Functional Requirements

1. **Performance**
   - Must complete scanning for an account with 1,000 resources across 5 regions in under 10 minutes using 10 workers.
   - Minimize API rate limiting by adhering to AWS service limits.

2. **Security**
   - Ensure all API calls use HTTPS.
   - Do not store AWS credentials; they must be loaded into memory only for the duration of the scan.
   - Mask sensitive information (e.g., Access Keys) in logs.

3. **Scalability**
   - Support scanning accounts with up to 10,000 resources across all AWS regions without degradation in performance.

4. **Resilience**
   - Recover gracefully from transient AWS API errors (e.g., throttling, network issues) by implementing retries with exponential backoff.

---

## Acceptance Criteria

1. The scanner enumerates resources from all specified AWS services and outputs them in the `Asset` struct format.
2. The scanner operates successfully with read-only credentials and fails gracefully if permissions are insufficient.
3. The scanner completes a scan of an account with 1,000 resources across 5 regions in under 10 minutes using 10 workers.
4. The output JSON file contains all discovered assets, with no missing or malformed fields.
5. Errors during scanning (e.g., API throttling) are logged, and the scan continues for unaffected resources.
6. CLI options function as specified, including the ability to configure regions, workers, and output paths.
7. Credentials are not written to disk or exposed in logs.

---

## Dependencies on Other Features

1. **Common Asset Struct**
   - The `Asset` struct must be defined and available for use by the scanner. Changes to this struct may require corresponding updates to the scanner.

2. **Logging Framework**
   - The scanner requires access to the centralized logging framework to ensure consistent error reporting and auditability.

3. **Credential Management**
   - Integration with existing credential management mechanisms (e.g., secure storage or environment variable injection) is required.

---

## Out of Scope

1. **Resource Remediation**
   - The scanner will not modify or remediate any discovered resources.
   
2. **Detailed Configuration Analysis**
   - The scanner will not perform in-depth analysis of resource configurations (e.g., IAM policy evaluation, S3 bucket ACL checks).

3. **Cross-Account Role Assumption**
   - The scanner will not assume roles in other AWS accounts; it operates within a single account per execution.

4. **Non-AWS Resources**
   - The scanner is limited to AWS resources and will not enumerate assets from other cloud providers or on-premises environments.
