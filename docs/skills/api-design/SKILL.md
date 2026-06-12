# SKILL.md

## Metadata

- **Name:** API Design & Contract Management
- **Description:** API design covering RESTful maturity, protocol selection (REST/GraphQL/gRPC), versioning strategy, error standardization, pagination contracts, rate-limiting design, and contract-first development with OpenAPI.
- **Tags:** API, REST, GraphQL, gRPC, OpenAPI, versioning, pagination, rate-limiting, error-handling, contract-first
- **Version:** 1.0.0

---

## When to Use

- **USE WHEN:** Designing a new API endpoint or service, choosing between REST/GraphQL/gRPC, defining error response schemas, planning API versioning strategy, implementing pagination or rate-limiting, or generating API documentation from contracts.
- **DO NOT USE FOR:** Internal function/method signatures, database query design (see Database skill), UI component state management (see UI/UX skill), or application security beyond API authorization patterns (see Security skill).

---

## Constraints & Rules

- **APIs have a versioning lifecycle:** Every public API will eventually need a breaking change. Evaluate versioning strategy (URI path `/v1/`, header `Accept-Version`, or contract negotiation) by consumer coupling and update frequency. URI versioning is explicit but creates endpoint sprawl; header versioning is cleaner but invisible in logs without additional effort.
- **Error responses must follow a consistent, documented schema:** Ad-hoc error formats force every client to implement brittle parsing logic. Use RFC 9457 Problem Details (`type`, `title`, `status`, `detail`, `instance`) as the standard error envelope. Machine-readable error codes within the envelope enable automated client handling.
- **Pagination must be explicit and consistent:** Every list endpoint must define its pagination strategy (cursor vs. offset), page size limits, and total-count availability. Cursor-based pagination is stable under data changes; offset-based pagination is simpler but produces duplicates/skips when rows are inserted or deleted between pages.
- **Rate limiting must communicate limits and retry timing:** Clients need `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `Retry-After` headers to self-throttle. Rate-limiting without feedback headers causes clients to retry blindly, compounding the problem.
- **Configuration that varies by environment must be injected, not hardcoded:** API keys, base URLs, timeouts, and feature flags for external service integrations must be externalized as environment variables or a config hierarchy (defaults ← env ← file ← flags). Hardcoded per-environment configuration creates drift, is unreviewable, and cannot be rotated without a deploy.

---

## Core Principles

- **Contract-first development:** Define the API contract (OpenAPI, GraphQL schema, protobuf) before implementing the server. The contract is the source of truth — server and client implementations are derived. Contract-first prevents integration bugs at deploy time instead of discovering them at runtime.
- **Backward compatibility is the default:** A well-designed API can add fields, add endpoints, and extend functionality without breaking existing clients. Breaking changes (removing fields, changing types, making optional fields required) should be a conscious decision with a documented migration path.
- **APIs should be designed for their consumers, not their implementation:** Endpoints should model user-facing operations ("place order", "search products") not database operations ("insert order row", "join products and inventory"). API shape driven by client needs produces more stable, intuitive interfaces.
- **Every endpoint must define its error states:** Document every HTTP status code a client should handle (200, 201, 204 for success; 400, 401, 403, 404, 409, 422, 429, 500 for failures). Undocumented error codes force clients to guess, and guesswork produces fragile integrations.
- **Idempotency for mutation endpoints:** POST and PATCH endpoints that create or update resources should support idempotency keys (`Idempotency-Key` header) to allow safe retries. Without idempotency, network retries risk duplicate orders, duplicate payments, or duplicate records.

---

## Workflow

- **Protocol selection phase — factors to consider:**
  - What are the client types? (REST for browser/mobile/third-party, GraphQL for complex data requirements with multiple consumer teams, gRPC for internal service-to-service with strict contracts and streaming needs)
  - What is the data fetching pattern? (GraphQL excels at sparse field selection and nested data; REST works best with well-defined resource boundaries; gRPC is optimized for high-throughput, low-latency internal calls)
  - What tooling ecosystem exists? (OpenAPI has the broadest tooling support across languages; GraphQL has strong typed query tooling; gRPC requires protobuf compilation and has limited browser-native support without gRPC-Web)

- **Endpoint design phase — factors to consider:**
  - Does the endpoint represent a resource (REST) or an action (RPC)? (REST: CRUD on nouns; RPC: verbs as endpoints — choose by whether the interface is data-centric or operation-centric)
  - What is the granularity of the response? (avoid over-fetching by scoping response schemas to the known consumer's needs; over-fetching costs bandwidth, serialization time, and exposes unnecessary data)
  - Are there compound operations that should be atomic? (use transactional endpoints for operations that must succeed or fail together, rather than making clients coordinate multiple API calls)

- **Versioning & deprecation phase — factors to consider:**
  - What versioning strategy matches the consumer update velocity? (public APIs with many independent consumers → URI versioning; internal SPAs you control → header versioning; mobile apps with slow adoption → support multiple versions with sunset dates)
  - How are deprecated endpoints communicated? (`Sunset` HTTP header with date, `Deprecation` header with migration URL, developer notification before enforcement)
  - What is the minimum supported version overlap? (maintain N-2 versions minimum; deprecate one version at a time to avoid cascade migrations)

- **Configuration & secrets for API services — factors to consider:**
  - What varies per environment? (API base URLs, database connection strings, external service credentials, log levels, feature flags — these must be externalized)
  - What is the config hierarchy precedence? (defaults → environment variables → config file → CLI flags — each level overrides the previous)
  - How are secrets distinguished from non-sensitive config? (secrets go to a secret manager or CI/CD secrets store; non-sensitive config is safe in environment-specific config files — never mix them)

---

## Anti-patterns

- **Over-normalization of endpoints:** Creating a separate endpoint for every field mutation. Causes N+1 network requests, chatty APIs, and state inconsistency windows. The overlooked factor: design endpoints around user-facing operations, not database table shapes.
- **Silent breaking changes:** Removing a field, changing a response type, or making an optional field required without changing the version. The overlooked factor: even "minor" response changes can crash clients that deserialize strictly — version or communicate every breaking change.
- **Inconsistent error responses:** Returning `{error: "bad request"}` from one endpoint, `{message: "Invalid"}` from another, and HTML from a third. The overlooked factor: each client must implement custom parsing for each endpoint, multiplying maintenance cost with every integration.
- **Leaking internal implementation in responses:** Returning stack traces, database error messages, ORM entities directly, or internal IDs to external clients. The overlooked factor: internal details expose attack surface, couple clients to implementation, and violate encapsulation — translate between internal and external representations explicitly.
- **No pagination on list endpoints:** Returning unbounded result sets that grow with data volume until they timeout or crash the server. The overlooked factor: every list endpoint will eventually have enough data to need pagination — designing it from the start is cheaper than retrofitting.

---

## Decision Framework (Conflict Resolution)

| Priority | Principle | Rule | Example |
|----------|-----------|------|---------|
| **1** | **Backward compatibility** | Existing clients must not break unless explicitly versioned and communicated. | Add fields, don't remove them. Mark as deprecated before removal. |
| **2** | **Consumer-driven design** | API shape serves the consumer's use case, not the database schema or internal architecture. | Design around "search flights" not "SELECT from flights table". |
| **3** | **Consistent contract** | All endpoints follow the same error schema, pagination style, and naming conventions. | Use RFC 9457 Problem Details everywhere, or nowhere. |
| **4** | **Performance budget** | Response size, query complexity, and rate limits must be explicit and measured. | Set max page size, max query depth for GraphQL, and per-key rate limits. |
| **5** | **Developer convenience** | Tooling (codegen, client SDKs, documentation generation) should reduce friction, but never at the cost of priorities 1–4. | Use OpenAPI codegen but validate the generated schema against the contract, not blindly. |

---

## Self-Check Checklist

- [ ] All error responses follow a consistent schema (RFC 9457 or equivalent) across every endpoint
- [ ] All list endpoints implement pagination (cursor preferred for production; offset acceptable for admin/internal)
- [ ] Rate-limiting returns `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `Retry-After` headers
- [ ] Breaking changes handled via version increment or `Sunset` header — no silent breaking changes
- [ ] API contract (OpenAPI/GraphQL schema/protobuf) exists before implementation — contract is source of truth
- [ ] No internal implementation details (stack traces, DB errors, ORM entities) leaked in responses
- [ ] Idempotency keys supported for mutation endpoints that could be retried
- [ ] Configuration that varies by environment is externalized (never hardcoded); secrets are separated from non-sensitive config
- [ ] Deprecation timeline communicated with migration guide before enforcement

---

## Related Skills

- See also: **Security & Threat Modeling** for API authentication patterns, secret injection, and rate-limiting as a security control.
- See also: **Performance Engineering** for caching strategies, response compression, and connection pooling at the API gateway.
- See also: **Documentation Architecture & Information Design** for API reference documentation structure.
