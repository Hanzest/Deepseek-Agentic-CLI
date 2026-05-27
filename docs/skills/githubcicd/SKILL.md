# SKILL.md

## Metadata

- **Name:** GitHub & CI/CD
- **Description:** Continuous integration and continuous delivery practices using GitHub-based tooling - covering workflow design, pipeline security, environment management, and release governance.

---

## When to Use

- **USE WHEN:** Designing or evaluating CI/CD pipelines, GitHub Actions workflows, branch protection rules, release strategies, secret management, or deployment automation for a software project.
- **DO NOT USE FOR:** Local development setup, container orchestration at runtime (see Docker skill), infrastructure-as-code provisioning (Terraform/Pulumi), or monitoring/observability runbooks.

---

## Constraints & Rules

- **Secret exposure surface:** Secrets (API keys, tokens, credentials) must never appear in workflow logs, environment variable dumps, or artifact outputs. Consider GitHub's secret scanning and branch protection as layered defenses, not substitutes for careful secret scoping.
- **Pipeline execution cost:** CI/CD minutes and concurrent job limits are finite (especially on free/team plans). Evaluate whether every push, every branch, and every matrix combination genuinely needs full pipeline execution - versus conditional triggers and path filters.
- **Approval gate friction:** Required reviewers, environment approvals, and deployment protection rules add safety but also latency. Consider the trade-off between deployment velocity and risk tolerance - over-gating discourages frequent shipping; under-gating increases incident blast radius.
- **Artifact retention policy:** Build artifacts, logs, and cache consume storage. Evaluate retention duration against audit requirements and debugging window needs. Indefinite retention incurs cost without proportional value.
- **Cross-repo token scope:** `GITHUB_TOKEN` scoped to a single repository cannot access other repositories. When cross-repo workflows are needed, consider GitHub App installation tokens or OpenID Connect (OIDC) for temporary, scoped credentials - never reuse personal access tokens.

---

## Core Principles

- **Fail fast in pipelines:** Validation steps (lint, type-check, unit tests) should execute before expensive steps (integration tests, build, deploy). Catching failures early saves runner minutes and developer context-switching cost.
- **Pipeline as code:** Workflow definitions should live in the repository, versioned alongside the code they build. Out-of-band pipeline configuration (manual UI setup) creates drift, is unreviewable, and cannot be rolled back.
- **Immutable build artifacts:** Build once, promote across environments - never rebuild for each environment. Rebuilding introduces inconsistency risk between tested artifacts and deployed ones.
- **Least privilege for deployment credentials:** Each environment (dev, staging, production) should use distinct credentials scoped to the minimum required permissions. Production credentials should never be accessible from pull request workflows.
- **Idempotent deployments:** A deployment should produce the same result whether it runs for the first time or the tenth. Non-idempotent steps (e.g., appending without checking existence) create unrecoverable states.

---

## Workflow

- **Pipeline design phase - factors to consider:**
  - Which events trigger which workflows? (push, PR, schedule, manual dispatch - each has different cost, latency, and security implications)
  - What is the optimal job parallelization vs. dependency graph? (independent jobs run in parallel; sequential jobs reduce retry surface for dependent work)
  - How are matrix strategies scoped? (OS versions, language versions, deployment targets - each axis multiplies runner cost linearly)

- **Deployment phase - factors to consider:**
  - What is the rollback mechanism? (revert commit, previous artifact, feature flag toggle - each has different speed and safety characteristics)
  - How are environment-specific variables injected? (GitHub Environments, repository secrets, OIDC - evaluate by audit trail needs and secret rotation complexity)
  - What constitutes a deployment success? (health check pass, smoke test, metric stabilization - define exit criteria explicitly)

- **Security & compliance phase - factors to consider:**
  - Are third-party Actions pinned by commit SHA (not semver tag) to prevent supply-chain compromise?
  - What audit trail exists for who approved what deployment to which environment?
  - How are stale or unused secrets detected and rotated?

---

## Anti-patterns

- **Deploying from feature branches directly to production:** Bypasses environment progression and approval gates. Increases blast radius and removes the safety net of staging validation. The overlooked factor: environment promotion is a risk-reduction mechanism, not a bureaucratic step.
- **Checking in secrets as base64-encoded variables:** Base64 is encoding, not encryption - trivially reversible. Exposed in pipeline logs, artifact downloads, and repository history forever. The overlooked factor: encoded secrets are still secrets and must be treated with the same rigor.
- **Monolithic workflow with everything in one file:** One workflow that runs lint, test, build, deploy across all environments. Makes it impossible to retry or skip stages independently, and conflates CI (quality validation) with CD (environment promotion). The overlooked factor: CI and CD have different failure modes, retry strategies, and access control requirements.
- **Ignoring pipeline timeouts:** Workflows without timeout limits can run indefinitely, consuming runner minutes and blocking concurrent runs. The overlooked factor: every pipeline step should have a bounded execution window - unbounded steps are a cost and availability risk.
