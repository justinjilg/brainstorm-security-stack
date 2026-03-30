<!-- Agent: alex-crypto | Model: gpt-4.1-2025-04-14 | Cost: $0.0294 | Latency: 118135ms -->
<!-- Route: explicit | Quality: 0.73 | Reputation: gold -->
<!-- Budget remaining: $50.00 -->
Absolutely. Here’s a full cryptographic requirements spec for the CSPM scanner, referencing Jordan’s and River’s work, and grounded in current best practice. I’ll call out where their designs are solid and where we need to tighten up, and I’ll be explicit about algorithms, key sizes, and operational processes.

---

# 1. Key Management Architecture

**Hierarchy:**
- **Root Key (KMS Master Key):**
  - Managed by cloud-native KMS (AWS KMS, Azure Key Vault, GCP KMS).
  - Never leaves HSM boundary.
  - Used only to encrypt/decrypt tenant data keys (envelope encryption).
- **Tenant Data Keys:**
  - Unique 256-bit AES keys per tenant (minimum: AES-256-GCM).
  - Used to encrypt all tenant-specific secrets and sensitive data at rest.
  - Rotated at least every 90 days, or immediately on tenant offboarding or compromise.
- **Session Keys:**
  - Ephemeral, used for in-memory operations (e.g., decrypting credentials for a scan).
  - Zeroed from memory immediately after use.
- **JWT Signing Keys:**
  - Prefer asymmetric (ECDSA P-256 or Ed25519). If using HMAC (HS256), must be 256 bits, but asymmetric is strongly preferred for auditability and separation of concerns.
  - Private key stored in HSM/KMS; public key distributed to all verifier services.
  - Rotate signing keys every 90 days, or immediately on compromise/role change.

**Key Management Controls:**
- All key generation, storage, and rotation events are logged and auditable.
- No application code should ever have access to root keys; only to tenant keys via KMS APIs.
- All key material in transit (even between services) is encrypted using TLS 1.3 (see below).

**References:**
- Jordan’s JWT design assumes strong key separation, but does not specify algorithm. I recommend ECDSA or Ed25519, not HMAC, for JWTs.
- River’s threat model highlights multi-tenant isolation: per-tenant keys directly mitigate cross-tenant data exposure.

---

# 2. TLS Configuration

**Minimum Version:**  
- TLS 1.3 only.  
- Explicitly disable TLS 1.2 and below.

**Cipher Suites:**  
- Only allow AEAD ciphers:
  - `TLS_AES_256_GCM_SHA384`
  - `TLS_CHACHA20_POLY1305_SHA256`
  - `TLS_AES_128_GCM_SHA256` (if necessary for compatibility, but prefer 256-bit)
- Disable all CBC-mode and legacy ciphers.
- Prefer ECDHE key exchange (X25519 or P-256 curves).

**Certificate Management:**
- All public endpoints (API, dashboard) require certificates from a reputable public CA (e.g., Let’s Encrypt, DigiCert).
- Internal mTLS (see #6) uses a private CA, with short-lived leaf certs (max 30 days).
- Certificates and private keys stored in memory only; never written to disk unencrypted.

**References:**
- River’s attack tree: TLS 1.3 and strong cipher suites directly mitigate eavesdropping, MITM, and downgrade attacks.

---

# 3. Data Encryption at Rest

**What Gets Encrypted:**
- All secrets: cloud provider credentials, JWT signing keys, refresh tokens, service account keys.
- All tenant-specific findings, evidence, and compliance artifacts.
- All audit logs containing sensitive operations (e.g., credential use, scan triggers).

**What Doesn’t Get Encrypted:**
- Non-sensitive metadata: scan timestamps, resource counts, public compliance mappings.
- Application logs (unless they contain sensitive data — which they should not by design).

**Why:**  
Encrypting only sensitive data minimizes performance overhead and reduces risk of accidental plaintext exposure. All encryption uses per-tenant AES-256-GCM keys, managed via envelope encryption with the root key.

**References:**
- Jordan: “All credentials are encrypted at rest (Postgres).” Correct — but extend to all sensitive findings as well.
- River: Cross-tenant data exposure risk is directly mitigated by per-tenant encryption.

---

# 4. Secrets Management

**Cloud Provider Credentials:**
- Encrypted at rest with tenant data key.
- Decrypted only in scanner process memory, zeroed after use.
- Never logged or exported.

**API Keys (internal/external):**
- Stored in secrets manager (AWS Secrets Manager, Azure Key Vault, GCP Secret Manager).
- Access tightly scoped via IAM roles; audit all access.

**JWT Signing Keys:**
- Private key stored only in HSM/KMS.
- Public key distributed via secure channel to all verifier services.
- Key rotation process includes revoking old tokens and updating public keys atomically.

**Operational Controls:**
- All secrets access is logged and monitored for anomalies.
- No hardcoded secrets in source code or container images.
- Support emergency secret rotation (e.g., on suspected compromise).

**References:**
- Jordan’s design is solid on credential handling, but I’d mandate HSM-backed storage for JWT keys.

---

# 5. Post-Quantum Readiness Assessment

**Current State:**
- All algorithms (AES-256-GCM, ECDSA, Ed25519, X25519) are not quantum-safe.
- TLS 1.3: X25519/ECDHE is vulnerable to quantum attacks (Shor’s algorithm).
- JWT: ECDSA/Ed25519 signatures are quantum-vulnerable.

**What Needs to Change (when NIST PQC standards finalize):**
- **TLS:**  
  - Add hybrid key exchange (e.g., X25519 + Kyber) as soon as supported by Go libraries and major cloud load balancers.
  - Monitor for Go crypto library support for NIST KEMs (Kyber, etc).
- **Data at Rest:**  
  - AES-256 remains quantum-resistant (Grover’s only halves keyspace; 256 bits is sufficient).
  - For signatures (JWT, mTLS): migrate to NIST PQC signature schemes (e.g., Dilithium) when available and libraries are stable.
- **Key Management:**  
  - Root and tenant keys: consider hybrid wrapping (AES + PQC KEM) if/when supported by cloud KMS.
- **Timeline:**  
  - Begin internal testing within 6 months of NIST finalization; full migration within 18 months.

**References:**
- River: No immediate risk, but a motivated attacker with quantum capability could retroactively decrypt past traffic. Forward secrecy and rapid migration are essential.

---

# 6. Certificate Lifecycle (Inter-Service mTLS)

**Issuance:**
- Private CA issues leaf certificates for each service instance.
- Certs are short-lived (max 30 days; prefer 7 days).
- Automated issuance via ACME or SPIRE.

**Rotation:**
- Certs rotated automatically before expiry (at least every 30 days).
- Manual rotation on compromise or CA rollover.

**Revocation:**
- Immediate revocation via CRL or OCSP for compromised certs.
- All service instances must check revocation status on peer certs.

**Operational Controls:**
- All private keys generated in-memory, never written to disk unencrypted.
- mTLS enforced on all inter-service calls (future-proofing for microservices split).

**References:**
- Jordan: “If/when modules are split into microservices: Use mTLS between services.” Correct — but specify short-lived certs and revocation process now to avoid technical debt.

---

# Algorithm, Key Size, and Rotation Summary

| Use Case                | Algorithm(s)              | Key Size           | Rotation Interval     | PQC Plan                |
|-------------------------|---------------------------|--------------------|----------------------|-------------------------|
| Data at rest            | AES-GCM                   | 256 bits           | 90 days/compromise   | AES-256 is sufficient   |
| JWT signing             | ECDSA P-256 / Ed25519     | 256 bits           | 90 days/compromise   | Migrate to Dilithium    |
| TLS/mTLS                | TLS 1.3, X25519/ECDHE     | 256 bits           | Cert: 30 days        | Add Kyber hybrid KEX    |
| Root/tenant keys        | KMS/HSM AES-256           | 256 bits           | 90 days/compromise   | Hybrid KEM wrapping     |
| Cloud creds encryption  | AES-GCM                   | 256 bits           | 90 days/compromise   | AES-256 is sufficient   |

---

# Direct Mitigations to River’s Threats

- **Cross-tenant data leakage:** Per-tenant keys, strict key separation, and envelope encryption.
- **Credential theft:** In-memory decryption only, zeroization, audit logging, and HSM-backed secrets.
- **Eavesdropping/MITM:** TLS 1.3 only, AEAD ciphers, mTLS for internal traffic.
- **Replay/downgrade attacks:** TLS 1.3 disables renegotiation and legacy protocol fallback.
- **Token forgery:** Asymmetric JWT signing (ECDSA/Ed25519), short-lived tokens, key rotation, and revocation.
- **Compromised service instance:** Short-lived mTLS certs, rapid revocation, and audit trails.

---

# Final Notes

- **Jordan’s JWT design:** If using HMAC (HS256), that’s wrong for multi-service, multi-tenant. Use ECDSA or Ed25519, managed in HSM/KMS, with public key distribution and rotation.
- **Key rotation:** 90 days is industry standard; shorter if feasible. All rotation events must be auditable and trigger revocation of old tokens/certs.
- **PQC:** Start hybridizing as soon as libraries are available; don’t wait for a “big bang” migration.

If anyone disagrees with asymmetric JWT signing or thinks HS256 is “good enough,” I’ll cite RFC 8725 (“JSON Web Token Best Current Practices”) and NIST 800-63B. Symmetric JWTs are a liability in a distributed, multi-tenant system.

— Alex
