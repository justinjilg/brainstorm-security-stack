<!-- Agent: morgan-devops | Model: gpt-4.1-2025-04-14 | Cost: $0.0329 | Latency: 118101ms -->
<!-- Route: explicit | Quality: 0.76 | Reputation: gold -->
<!-- Budget remaining: $50.00 -->
Absolutely. Here’s how I’d design a production-grade CI/CD pipeline for the Living Case Study security stack, referencing Sage’s PRD, Quinn’s modular monolith architecture, and Alex’s cryptographic requirements. I’ll be concrete on tooling, show how the pipeline topology maps to the architecture, and call out where security controls directly satisfy Alex’s requirements.

---

## 1. Pipeline Stages

**Top-level stages:**
1. **Build**  
   - Compile Go binaries, build Docker image for the modular monolith.
2. **Test**  
   - Run unit, integration, and (eventually) e2e tests.
3. **Security Scan**  
   - SAST (code scanning), secret detection, dependency checks, container scanning.
4. **Staging Deploy**  
   - Deploy signed artifact to a Kubernetes staging environment.
5. **Production Deploy**  
   - Deploy to production, with gates and rollback controls.

---

## 2. Security Controls in the Pipeline

**SAST:**  
- [GitHub CodeQL](https://github.com/github/codeql-action): Static analysis for Go code, detects common vulns (injection, unsafe crypto, etc.).

**DAST:**  
- [OWASP ZAP](https://github.com/marketplace/actions/owasp-zap-full-scan) (for API endpoints, post-staging deploy).

**Container Scanning:**  
- [Trivy](https://github.com/aquasecurity/trivy-action): Scans Docker images for OS and language-level CVEs.

**Secret Detection:**  
- [Gitleaks](https://github.com/gitleaks/gitleaks-action): Scans repo and build context for hardcoded secrets.

**Dependency Scanning:**  
- [Dependabot](https://docs.github.com/en/code-security/dependabot) (native to GitHub) and Trivy for Go modules.

**Image Signing & Verification:**  
- [Cosign](https://github.com/sigstore/cosign): Signs Docker images after build, verifies signature before deploy.

---

## 3. GitHub Actions Workflow Structure

**Key jobs:**  
- `build`: Compile Go, build Docker image, upload artifacts.
- `test`: Run tests (unit/integration), parallelized by package.
- `sast`: Run CodeQL.
- `secretscan`: Run Gitleaks.
- `container-scan`: Run Trivy.
- `sign-image`: Sign Docker image with Cosign.
- `deploy-staging`: Deploy to staging K8s cluster.
- `dast`: Run ZAP scan against staging API.
- `deploy-prod`: Deploy to production K8s cluster (gated).
- `verify-image`: Verify Cosign signature before deployment.

**Parallelization:**  
- `build`, `test`, `sast`, `secretscan`, `container-scan` run in parallel after code checkout.
- `sign-image` depends on successful `build` and `container-scan`.
- `deploy-staging` waits for all security checks and signing.
- `dast` runs after staging deploy, must pass before production deploy.
- `deploy-prod` is manual or gated (see below).

**Workflow YAML (simplified):**
```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps: [...]
  test:
    needs: build
    runs-on: ubuntu-latest
    strategy:
      matrix:
        package: [scanner, policy, remediation, api]
    steps: [...]
  sast:
    needs: build
    steps: [...]
  secretscan:
    needs: build
    steps: [...]
  container-scan:
    needs: build
    steps: [...]
  sign-image:
    needs: [build, container-scan]
    steps: [...]
  deploy-staging:
    needs: [test, sast, secretscan, sign-image]
    steps: [...]
  dast:
    needs: deploy-staging
    steps: [...]
  verify-image:
    needs: dast
    steps: [...]
  deploy-prod:
    needs: [verify-image]
    if: github.event_name == 'workflow_dispatch'
    steps: [...]
```
**Note:**  
- All jobs fail-fast; no deploy if any security check fails.
- Production deploy is gated (manual approval or automated policy).

---

## 4. Artifact Management

**Docker Images:**  
- Built with unique tags per commit (`living-cspm:<git-sha>`), latest for branch, and semver for releases.
- Stored in [GitHub Container Registry](https://ghcr.io/) or AWS ECR.

**Go Binaries:**  
- Compiled as part of Docker build; optionally uploaded as release assets for debugging.

**Versioning:**  
- Semantic versioning (`vX.Y.Z`), auto-tagged on main branch merges.
- Images and binaries are always traceable to a commit SHA.

**Image Signing:**  
- Cosign signs images post-scan, using a key stored in a KMS (see Secret Handling).

---

## 5. Environment Promotion Strategy

- **dev**: Feature branches, ephemeral PR environments (optional).
- **staging**: Main branch merges auto-deploy here after passing all checks.
- **production**: Only after staging passes DAST and manual/automated approval.

**Promotion flow:**  
- No direct deploy to prod from feature branches.
- Promotion is via artifact/image, not source code — guarantees what’s tested is what’s deployed.
- Staging and prod use separate K8s namespaces/clusters, with distinct secrets and credentials.

---

## 6. Secret Handling in CI/CD

**How to securely inject cloud credentials and API keys in CI/CD, per Alex’s crypto requirements:**

- **No secrets in repo or Docker build context.**
- **All secrets (cloud creds, KMS keys, JWT signing keys) are stored in GitHub Actions Encrypted Secrets** or, for higher assurance, in a cloud-native secrets manager (AWS Secrets Manager, Azure Key Vault, GCP Secret Manager).
- **Short-lived, least-privilege credentials:**  
  - For build/test: Use OIDC/GitHub Actions Workload Identity Federation to get ephemeral cloud credentials (no static secrets in GitHub).
  - For deploy: The deploy job requests a short-lived token from cloud KMS/Secrets Manager, injects as env vars or mounts as files, and zeroes after use.
- **Cosign key for image signing:**  
  - Store private key in KMS/HSM (AWS KMS, GCP KMS), never in repo or GitHub Secrets.
  - Use [Cosign KMS support](https://docs.sigstore.dev/cosign/kms/) to sign images directly with KMS-managed key.
- **JWT signing keys:**  
  - Never exposed to CI/CD. If rotation is needed, trigger via a secure admin workflow, not in pipeline.
- **Audit all secret access:**  
  - All secrets access in pipeline is logged (GitHub Actions audit log, KMS/Secrets Manager logs).

**Tooling:**
- [actions/github-script](https://github.com/actions/github-script) for dynamic secret fetch.
- [aws-actions/configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials) with OIDC for AWS.
- [Azure/login](https://github.com/Azure/login) for Azure.
- [google-github-actions/auth](https://github.com/google-github-actions/auth) for GCP.

---

## 7. Rollback Strategy and Deployment Gates

**Deployment Gates:**  
- Production deploy is gated by:
  - All security scans green (SAST, DAST, container, secrets).
  - Manual approval (GitHub Actions `environment` protection rules) or automated policy (e.g., OPA/Gatekeeper).
  - Cosign signature verification before deploy.
  - DAST scan of staging passes with no criticals.

**Rollback:**  
- All deploys are versioned and tagged.
- Rollback is a redeploy of the previous signed image (immutable artifact).
- Rollback is automated via GitHub Actions workflow dispatch (`deploy-prod` with previous image tag).
- Rollback can be triggered by failed health checks, SLO violation, or manual intervention.
- All rollbacks are logged and require approval (if in production).

---

## How Multi-Component System Affects Pipeline Topology

**Quinn’s modular monolith:**  
- All major components (Scanner Engine, Policy Engine, Remediation, API) are in a single Go repo and built into one Docker container.
- **Pipeline runs as a single unit:**  
  - Unit/integration tests can be parallelized by package (scanner, policy, remediation, api).
  - If/when components are split into microservices, pipeline will need to build/test/deploy each independently, but for v1, a single pipeline suffices.
- **Artifact is a single Docker image:**  
  - Ensures all modules are version-locked and tested together.
- **Testing:**  
  - Integration tests should spin up the full service (with a test Postgres instance) and hit all module APIs.

---

## How Pipeline Controls Satisfy Alex’s Crypto Requirements

- **Secret scanning (Gitleaks):**  
  - Ensures no hardcoded secrets, aligning with “no secrets in source or images.”
- **SAST and dependency scanning:**  
  - Catch unsafe crypto usage (e.g., non-AES-256, deprecated algorithms).
- **Container scanning (Trivy):**  
  - Ensures no vulnerable crypto libraries in base images.
- **Cosign signing with KMS:**  
  - Enforces that only signed, auditable images are deployed, with keys never exposed to pipeline.
- **OIDC-based credential injection:**  
  - No static cloud credentials in CI/CD, aligns with “ephemeral, auditable credential use.”
- **Audit logging:**  
  - All secret access (KMS, secrets manager) is logged, satisfying auditability requirements.

---

## Tooling Summary

- **Build/Test:** Go toolchain, Docker, GitHub Actions runners
- **SAST:** GitHub CodeQL
- **DAST:** OWASP ZAP
- **Container Scan:** Trivy
- **Secret Scan:** Gitleaks
- **Dependency Scan:** Dependabot, Trivy
- **Image Signing/Verification:** Cosign with KMS
- **Artifact Registry:** GHCR or ECR
- **K8s Deploy:** kubectl, Helm (optional)
- **Secrets Management:** OIDC + cloud-native secrets manager, never static secrets in CI/CD

---

## Final Thoughts

This pipeline is built for zero-downtime, auditable, and secure deploys. It’s designed to survive a real incident: if a secret leaks, we know when and how; if a deploy fails, rollback is fast and safe. The modular monolith makes the pipeline simple for now — if we go microservices later, we’ll split jobs and artifacts per service, but the security controls and artifact management patterns will scale.

If anyone thinks skipping Cosign or OIDC is “good enough,” I’ll show them the audit logs after a breach. This pipeline is built to avoid that page at 3 AM.

— Morgan
