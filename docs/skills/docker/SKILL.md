# SKILL.md

## Metadata

- **Name:** Docker & Containerization
- **Description:** Container image building, optimization, and runtime considerations - covering image layering, multi-stage builds, security posture, state management, and network topology factors.

---

## When to Use

- **USE WHEN:** Designing Dockerfiles, composing multi-container services, evaluating image size vs. build speed trade-offs, or making container security and networking decisions for development or production environments.
- **DO NOT USE FOR:** Orchestration-at-scale decisions (Kubernetes cluster topology, service mesh, autoscaling policies), infrastructure provisioning, or CI/CD pipeline design (see GitHub/CI-CD skill).

---

## Constraints & Rules

- **Image layer cacheability:** Each Dockerfile instruction creates a layer. Layer ordering determines cache hit rate - frequently-changing instructions (code COPY) should appear after infrequently-changing ones (base image, system packages). Every cache miss invalidates all subsequent layers.
- **Image size budgets:** Smaller images reduce pull time, storage cost, and attack surface. Consider distroless or scratch base images for production, but evaluate the debugging cost - no shell means no `docker exec` troubleshooting.
- **Running as non-root:** Containers default to root unless explicitly configured otherwise. A root-runtime container with a compromised process gives the attacker full control over the container. Evaluate the `USER` instruction and capability dropping as mandatory hardening steps.
- **Ephemeral filesystem assumption:** Containers can be destroyed and re-created at any time. Any data written to the container filesystem (writable layer) is lost on restart unless explicitly mounted as a volume. Evaluate state persistence strategy against this ephemerality.
- **Single responsibility per container:** A container should run one process (or one process group with a common lifecycle). Multi-process containers complicate health checks, resource limits, signal handling, and log aggregation.

---

## Core Principles

- **Build for immutability:** Once built, an image should not be modified. Configuration and data injection happen at runtime via environment variables, volumes, or secrets - never by creating a new image per configuration variant.
- **Minimal attack surface:** Each package in the image is a potential vulnerability. Evaluate whether each dependency (including OS packages, build tools, and dev dependencies) is necessary at runtime - if not, exclude it via multi-stage builds.
- **Deterministic builds:** The same Dockerfile and build context should produce the same image digest. Pinned base image digests (not tags like `:latest`) and lock files prevent unexpected behavior from upstream changes.
- **Leverage build cache by instruction ordering:** Order Dockerfile instructions from least-changing to most-changing (base → system dependencies → application dependencies → application code). This maximizes cache reuse across builds.
- **Health checks define container readiness:** A health check command should verify that the process can serve actual work, not just that the process is running (PID check is insufficient). Misconfigured health checks either miss failures or cause unnecessary restarts.

---

## Workflow

- **Image design phase - factors to consider:**
  - What base image provides the minimal runtime without missing required system libraries? (alpine vs. distroless vs. slim - each has different compatibility, size, and debugging profiles)
  - Which build-time dependencies can be isolated to a builder stage and excluded from the final image? (compilers, header files, package managers)
  - How are secrets handled during build? (BuildKit's `--secret` flag, not ARG or COPY - build args leak into image history)

- **Runtime configuration phase - factors to consider:**
  - What resource limits (CPU, memory) does the container need, and what happens when limits are exceeded? (OOM kills vs. throttling vs. graceful degradation)
  - Which paths require persistent volumes, and what are the backup/restore implications? (database data, user uploads, logs - each has different I/O profile and durability needs)
  - What network mode is appropriate? (bridge, host, overlay - each has isolation, performance, and port conflict trade-offs)

- **Security evaluation phase - factors to consider:**
  - What capabilities can be dropped from the default set? (e.g., `NET_RAW`, `SYS_ADMIN` - start with `--cap-drop=ALL` and add back only needed ones)
  - Is read-only root filesystem feasible? (read-only prevents many post-exploitation techniques but requires writable paths for logs, temp files, or PID files)
  - What image scanning frequency catches known CVEs? (registry-level scanning vs. CI pipeline scanning vs. runtime scanning - each detects at different points in the lifecycle)

---

## Anti-patterns

- **Fat image with everything in one layer:** Using a single `RUN` command that installs all packages, copies all files, and configures everything. Results in poor cache reuse, large images, and unclear provenance. The overlooked factor: layer granularity matters for both build speed and auditability.
- **Tagging images as `:latest` in production:** Cannot be rolled back, cannot be traced to a specific commit, and silently changes on rebuild. The overlooked factor: image tags should be immutable pointers to specific builds (semver, commit SHA, or build ID).
- **Storing secrets at build time via ARG:** `ARG` values persist in image history and can be extracted with `docker history`. The overlooked factor: ARG is for non-sensitive build metadata only; secrets require BuildKit's `--secret` or runtime secret injection.
- **Assuming containers are VMs:** Running SSH daemons, multiple services, or persistent filesystem state inside a container. Fights the container lifecycle model and introduces unnecessary complexity. The overlooked factor: containers are process-level isolation with ephemeral filesystems - design for restart, not uptime.
