# SKILL.md

## Metadata

- **Name:** Security & Threat Modeling
- **Description:** Application security covering threat modeling, vulnerability management, authentication/authorization patterns, secrets management, secure defaults, input/output sanitization, and dependency risk assessment.
- **Tags:** security, threat-modeling, authentication, authorization, secrets, OWASP, CVE, supply-chain, encryption, hardening
- **Version:** 1.0.0

---

## When to Use

- **USE WHEN:** Designing system architecture (threat model before implementation), handling user credentials or API tokens, accepting external input, managing dependencies, storing sensitive data, implementing access control, or designing any boundary between trust zones.
- **DO NOT USE FOR:** Generic UI/UX layout decisions (see UI/UX skill), Docker image layer optimization without security implications (see Docker skill), or performance tuning that does not involve cryptographic choices.

---

## Constraints & Rules

- **Input is untrusted until validated server-side:** Every entry point (HTTP body, query params, file upload, headers) must be validated for type, length, range, and format. Client-side validation is UX-only — never a security control. Injection attacks succeed where validation is absent, incomplete, or applied inconsistently.
- **Authentication is not authorization:** Verifying identity (authN) is a prerequisite for, but distinct from, verifying permission (authZ). AuthZ checks must be enforced at every API layer, not just at the gateway. A valid token does not imply access to any resource.
- **Secrets must never appear in code, logs, or build artifacts:** API keys, database credentials, private keys, and tokens must be injected at runtime via environment variables, secret managers (HashiCorp Vault, AWS Secrets Manager), or OIDC. Hardcoded secrets, base64-encoded secrets, and secrets in `.env` files committed to version control are all leaks. Evaluate secret detection (git-secrets, truffleHog) as a pre-commit hook.
- **Dependencies are an attack surface:** Each direct and transitive dependency is a potential CVE vector. Evaluate vulnerability scanning frequency (Dependabot, Snyk, npm audit), SBOM generation (CycloneDX), and the risk of supply-chain attacks (dependency confusion, typo-squatting). Pin dependencies to immutable versions (lock files, hash verification).
- **Cryptography decisions are irreversible once deployed:** Use established, audited libraries (not custom algorithms). Prefer high-level abstractions (libsodium, Google Tink) over raw primitives. Key rotation must be designed into the system, not added after a breach.

---

## Core Principles

- **Defense in depth:** Multiple independent security layers (network → host → application → data). If one layer fails, the next contains the breach. No single control is assumed sufficient.
- **Least privilege:** Every entity (user, service, process, token) should have the minimum permissions required to function. Evaluate whether a permission is needed before granting it — default deny, explicit allow.
- **Fail securely:** When an error occurs, the system should default to the secure state (deny access, close connection, log the failure). Fail-open defaults (e.g., "allow all if auth service is down") create vulnerabilities.
- **Never trust, always verify (zero trust):** Assume the network is compromised. Every request, including internal service-to-service calls, must be authenticated and authorized. Network position does not imply trust.
- **Security is a design constraint, not a feature:** Security requirements must be evaluated at the architecture phase, not bolted on after implementation. Retrofitting security is more expensive, more fragile, and more likely to have gaps.

---

## Workflow

- **Threat modeling phase — factors to consider:**
  - What are the trust boundaries? (user → API → service → database — each boundary is a threat surface)
  - What is the worst possible outcome if each asset is compromised? (STRIDE per element: Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege)
  - What is the attack surface exposed to unauthenticated users vs. authenticated users vs. internal services?

- **Authentication design phase — factors to consider:**
  - What identity provider matches the user base? (OAuth 2.0 + OIDC for federated identity, SAML for enterprise SSO, passwordless/WebAuthn for high-security contexts)
  - How are sessions managed? (JWT vs. opaque session tokens — JWT enables stateless verification but has revocation challenges; opaque tokens require a store but support immediate invalidation)
  - What is the password policy? (NIST SP 800-63: minimum 8 characters, no composition rules, check against known breach databases, allow paste managers)

- **Secrets & configuration management phase — factors to consider:**
  - What is the secret delivery mechanism per environment? (CI/CD secrets for pipeline, environment variables for runtime, secret manager API for dynamic rotation — each has different latency, audit, and rotation characteristics)
  - How are secrets rotated without downtime? (dual-key mapping during rotation window, grace periods for old keys)
  - What is the fallback behavior when a secret source is unreachable? (fail-fast vs. cached credentials vs. degraded mode — evaluate which aligns with the fail-securely principle)

- **Dependency management phase — factors to consider:**
  - What is the vulnerability scan cadence? (per-commit SCA, nightly scans, pre-release audits — each catches different classes of risk)
  - Are pinned versions enforced? (lock files, hash-pinned base images, vendored dependencies — evaluate by the cost of updates vs. the risk of unpinned supply-chain drift)
  - What is the policy for critical CVEs? (auto-merge patch updates for non-breaking vulns vs. manual review for all — evaluate by deployment velocity vs. risk tolerance)

---

## Anti-patterns

- **Security through obscurity:** Hiding endpoints, encoding secrets in base64, or using private-but-unencrypted channels as the sole protection. The overlooked factor: obscurity provides zero protection against a determined attacker — encryption, authentication, and authorization are the only verifiable controls.
- **Client-side authorization:** Checking user roles only in the frontend and assuming the backend is protected by obscurity. The overlooked factor: any client-side check can be bypassed by sending raw HTTP requests — all authorization must be enforced server-side.
- **Hardcoded defaults and backdoors:** Shipping with default credentials (`admin/admin`), debug endpoints enabled, or "temporary" hardcoded tokens. The overlooked factor: default credentials are the first thing automated scanners try; debug endpoints expose internal state.
- **Ignoring dependency updates:** Running `npm install` or `pip install` without lock files, or dismissing automated vulnerability PRs without review. The overlooked factor: each unpinned dependency is a supply-chain contract that can be rewritten without your knowledge.
- **Rolling your own crypto:** Implementing AES, RSA, or hashing from scratch instead of using audited libraries. The overlooked factor: cryptographic primitives are deceptively easy to get wrong (nonce reuse, padding oracle, timing side-channels) — use high-level abstractions from established libraries.

---

## Decision Framework (Conflict Resolution)

When security principles conflict, apply this priority ladder — higher priority overrides lower:

| Priority | Principle | Rule | Example |
|----------|-----------|------|---------|
| **1** | **Protect data at rest and in transit** | Encryption is non-negotiable for any sensitive data, regardless of performance cost. | Don't skip TLS to save 50ms of latency on an internal API. |
| **2** | **Defense in depth** | Multiple independent controls are better than a single strong control. | Even with a WAF, still validate input server-side. |
| **3** | **Least privilege** | Default deny, explicit allow. More convenience never justifies more permissions. | Don't use a root DB user because "it's easier" — create a migration user and an app user. |
| **4** | **Fail securely** | When in doubt, deny access and log. Fail-open is a design smell. | If the auth service is unreachable, return 503, not 200 with full access. |
| **5** | **Developer experience** | Security tooling should minimize friction, but never at the cost of priorities 1–4. | Use pre-commit hooks for secret detection rather than relying on developer discipline. |

---

## Self-Check Checklist

- [ ] All user inputs validated server-side: type, length, range, format
- [ ] No secrets in code, config files committed to version control, or build artifacts
- [ ] Authentication enforced at API gateway or middleware layer (not just client-side)
- [ ] Authorization check on every API endpoint, not just at entry point
- [ ] Dependencies pinned to immutable versions (lock file committed, base images by digest)
- [ ] TLS enforced for all external communication; internal communication evaluated for sensitivity
- [ ] Password storage uses a strong, slow hashing algorithm (bcrypt/argon2/scrypt) — never plaintext, SHA, or MD5
- [ ] Session tokens are revocable (opaque tokens) or have short expiry with refresh rotation (JWTs)
- [ ] No debug endpoints, admin panels, or test routes exposed in production builds

---

## Related Skills

- See also: **GitHub & CI/CD** for pipeline-level secret scanning, OIDC credential exchange, and supply-chain integrity in CI.
- See also: **API Design & Contract Management** for API-level authentication patterns and rate-limiting as a security control.
- See also: **Docker & Containerization** for container image hardening, non-root execution, and capability dropping.
