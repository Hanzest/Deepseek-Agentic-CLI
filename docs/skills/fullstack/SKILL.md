# SKILL.md

## Metadata

- **Name:** Fullstack Development
- **Description:** Full-stack software development covering frontend, backend, API design, data layer, and integration decisions — with emphasis on architecture, separation of concerns, and end-to-end system thinking.

---

## When to Use

- **USE WHEN:** Making architectural decisions that span the entire application stack — from data persistence through API layer to client-side rendering — or when evaluating trade-offs between frontend and backend responsibility boundaries.
- **DO NOT USE FOR:** Single-layer decisions (CSS-only layout, database index tuning, or Docker networking in isolation) that are better served by their respective domain skill documents.

---

## Constraints & Rules

- **Network round-trip budget:** Every client-server interaction incurs latency, bandwidth, and reliability costs. Consider the number of API hops a critical user flow requires — excessive chained requests degrade perceived performance regardless of server speed.
- **Data consistency model:** Evaluate whether the system requires strong consistency (e.g., financial transactions), eventual consistency (e.g., social feeds), or causal consistency. Choosing the wrong model leads to incorrect behavior or unnecessary complexity.
- **Authentication/authorization boundary:** Authentication belongs at the API gateway or middleware layer; authorization logic must be enforced server-side regardless of client-side checks. Client-only access control is a security illusion.
- **State ownership:** Determine whether state lives on the client (SPA state), server (session), or both (hybrid). Mismatched state ownership causes synchronization bugs and stale-data hallucinations.
- **Error contract discipline:** Every API endpoint should define its error response shape, status code range, and retry semantics. Ad-hoc error handling forces every client to implement brittle, inconsistent parsing logic.

---

## Core Principles

- **Separation of concerns across layers:** Presentation, business logic, data access, and infrastructure should be independently replaceable. A change in database technology should not cascade into the UI layer, and vice versa.
- **Loose coupling via contracts:** Frontend and backend communicate through explicit API contracts (OpenAPI, GraphQL schema, protobuf). Contract-first development prevents integration bugs at deploy time rather than discovering them at runtime.
- **Data flows in one direction:** Unidirectional data flow (action → reducer → state → view) reduces debugging complexity. Bi-directional or circular data flows create unpredictable state mutations that are difficult to trace.
- **Principle of least privilege for APIs:** Each endpoint should expose only the data and actions required by its known consumers. Over-fetching and over-exposing in "generic" endpoints creates coupling, bloat, and security surface area.
- **Fail fast, fail visibly:** Errors should be detected as close to their source as possible and propagated clearly. Swallowing errors or silently degrading behavior hides root causes and delays detection.

---

## Workflow

- **Architecture phase — factors to consider:**
  - How is the domain decomposed? (monolith vs. modules vs. services — evaluate by change frequency, team boundaries, and deployment coupling)
  - What is the data flow for the most critical user journey? (trace end-to-end: UI event → API → business logic → persistence → response → UI update)
  - What caching strategy does each layer tolerate? (HTTP caching, in-memory cache, CDN, database query cache — each has invalidation complexity and staleness tolerance)

- **Implementation phase — factors to consider:**
  - How are cross-cutting concerns handled without layer violation? (logging, monitoring, authentication, rate-limiting — should be middleware/decoration, not embedded in business logic)
  - What is the testing strategy per layer? (unit for logic, integration for API contracts, E2E for critical paths — each layer has different ROI and maintenance cost)
  - How does the system handle partial failure? (degraded UI, circuit breakers, retry with backoff, fallback data sources)

- **Deployment phase — factors to consider:**
  - Are frontend and backend deployments coupled or independent? (separate deployment cycles reduce risk but may require backward-compatible API versioning)
  - What is the rollback strategy for each layer? (feature flags, blue-green, canary — each has different complexity and safety profiles)

---

## Anti-patterns

- **Fat controller / thin service:** Business logic leaking into API route handlers. Becomes untestable, non-reusable, and violates single responsibility. The overlooked factor: separation of concerns should be applied within the backend, not just between frontend and backend.
- **Over-normalization of API endpoints:** Creating a separate endpoint for every data field mutation. Causes N+1 network requests, chatty APIs, and state inconsistency windows. The overlooked factor: design endpoints around user-facing operations, not database table shapes.
- **Client-mutated state as source of truth:** Relying on the client's copy of data after a mutation without server re-validation. Causes stale-data bugs when other clients or processes modify the same data. The overlooked factor: the server is the authoritative source for all persistent state.
- **Leaky abstractions across layers:** Database query structures (e.g., ORM includes, SQL fragments) appearing in the API layer or frontend. Couples layers to implementation details and prevents independent evolution. The overlooked factor: each layer should translate, not pass through, its data representation.
