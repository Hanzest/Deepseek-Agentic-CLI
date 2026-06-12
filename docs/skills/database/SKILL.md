# SKILL.md

## Metadata

- **Name:** Database & Data Modeling
- **Description:** Data persistence design covering schema design (normalization vs. denormalization), query optimization, indexing strategy, migration safety, data integrity enforcement, and storage engine selection.
- **Tags:** database, SQL, NoSQL, schema, indexing, migration, ORM, data-modeling, query-optimization, consistency
- **Version:** 1.0.0

---

## When to Use

- **USE WHEN:** Designing a database schema, writing queries that touch large datasets, planning schema migrations, selecting between SQL and NoSQL, optimizing slow queries, enforcing data integrity constraints, or evaluating ORM vs. raw query trade-offs.
- **DO NOT USE FOR:** Container storage decisions (ephemeral vs. volume — see Docker skill), caching layer design (see Performance Engineering skill), or data serialization formats for API payloads (see API Design skill).

---

## Constraints & Rules

- **Schema changes must be backward-compatible for zero-downtime deployments:** Old application versions may still be running during a rolling update. Adding a `NOT NULL` column without a default, renaming a column, or splitting a table causes runtime failures for in-flight requests. Evaluate each migration against the oldest application version still in production.
- **Indexing has read/write trade-offs:** Each index accelerates SELECT queries but slows INSERT/UPDATE/DELETE operations and consumes storage. Evaluate index selection by query frequency, selectivity (high-selectivity columns benefit most), and write volume. A missing index causes full table scans; an unused index wastes resources.
- **N+1 query detection is mandatory for ORM usage:** A loop that fetches related entities one-by-one instead of batch-loading them produces N+1 database round-trips. Evaluate every ORM relationship load strategy (eager vs. lazy vs. explicit batch loading) by the expected result set size and network latency budget.
- **Data integrity is the database's responsibility, not the application's:** Constraints (PRIMARY KEY, UNIQUE, FOREIGN KEY, CHECK) must be defined in the schema, not simulated in application code. Application-level integrity guarantees are lost when another service, a migration script, or a direct query touches the database.

---

## Core Principles

- **Design schema around access patterns, not object hierarchies:** Tables should reflect how data is queried and updated, not how it appears in the application's object model. Access path analysis (read/write ratio, join depth, filter columns) should precede schema design.
- **Normalize for integrity, denormalize for performance — measure first:** Start with normalized form (3NF) to eliminate redundancy and update anomalies. Denormalize only when measured query performance is unacceptable and caching or indexing are insufficient. Denormalization without measurement is guessing.
- **Migrations are code — version, review, and test them:** Each migration should be a versioned, reversible script that is peer-reviewed and tested against a copy of production data. Irreversible migrations (data loss, column removal) require explicit approval and a verified backup.
- **Choose consistency model based on business requirements:** Strong consistency for financial transactions and inventory; eventual consistency for social feeds and analytics; causal consistency for collaborative editing. Picking the wrong model causes either incorrect behavior or unnecessary latency.

---

## Workflow

- **Schema design phase — factors to consider:**
  - What are the primary access patterns? (reads vs. writes, single-row lookups vs. range scans, join depth and frequency)
  - What data integrity constraints are business-critical? (unique usernames, referential integrity, check constraints — each prevents a class of data corruption)
  - Is the data relational (structured, joins, ACID) or document-oriented (nested, schema-flexible, denormalized)? Choose SQL when relationships matter; choose NoSQL when the data shape is variable or hierarchical access is the norm.

- **Query optimization phase — factors to consider:**
  - Does the query have an appropriate index? (check EXPLAIN/EXPLAIN ANALYZE for seq scans vs. index scans vs. bitmap scans)
  - Is the query fetching more columns than needed? (SELECT * vs. explicit column list — affects network transfer, memory, and index-only scan eligibility)
  - How many round-trips does the operation require? (batch related queries into one round-trip where possible)

- **Migration design phase — factors to consider:**
  - Is the migration reversible? (each migration should have an up and down script)
  - Will the migration lock tables? (ALTER TABLE in PostgreSQL acquires ACCESS EXCLUSIVE lock — evaluate pg_config_lock_timeout and online migration tools for large tables)
  - Are there running application instances that expect the old schema? (expand-contract pattern: add column → deploy app to write both old and new → backfill → deploy app to read new → remove old column)

---

## Anti-patterns

- **Migrations that break running instances:** Adding a `NOT NULL` column without a default, removing a column still referenced by in-flight code, or renaming a table without a view/trigger bridge. The overlooked factor: during rolling deployments, old and new code run concurrently — schema changes must be additive and backward-compatible.
- **SELECT * in production queries:** Fetching all columns when only a few are needed, preventing index-only scans and wasting bandwidth. The overlooked factor: the cost of fetching and transmitting unused columns scales with row count and query frequency.
- **Missing indexes on foreign keys:** Foreign key columns are not automatically indexed in most databases, yet they are join targets. The overlooked factor: every FK-based JOIN without an index triggers a full table scan on the referenced table.
- **ORM-centric schema design:** Tuning the database schema to match the ORM's default table generation (eager-loaded relationships, single-table inheritance, auto-generated column types) instead of designing for query patterns. The overlooked factor: ORMs are abstraction layers that obscure database behavior — design the schema for the database, then map ORM to it.

---

## Decision Framework (Conflict Resolution)

| Priority | Principle | Rule | Example |
|----------|-----------|------|---------|
| **1** | **Data integrity** | Constraints in schema, not application — never sacrifice integrity for performance. | Use FK constraints even if inserts become slightly slower. |
| **2** | **Correctness** | Query results must be accurate — optimize only after correctness is verified. | Don't use a faster but incorrect JOIN type. |
| **3** | **Safety of migration** | Schema changes must not break running systems — zero-downtime over simplicity. | Use expand-contract pattern rather than a single ALTER. |
| **4** | **Query performance** | Optimize after measuring — index based on actual query plans, not intuition. | Don't add an index because "it might help" without EXPLAIN evidence. |
| **5** | **Developer convenience** | ORMs, migration tools, and abstraction layers are acceptable if they don't conflict with priorities 1–4. | Use ORM for 80% of queries; drop to raw SQL for the critical 20%. |

---

## Self-Check Checklist

- [ ] Schema has primary keys on every table; foreign keys have indexes where they are join targets
- [ ] All migrations are reversible (up + down scripts exist), additive-only (no destructive changes), and tested against production-like data
- [ ] ORM queries in loops checked for N+1 (batch loading or explicit eager loading used)
- [ ] `SELECT *` not used in production queries — explicit column lists for all read operations
- [ ] Indexes evaluated by query plan (EXPLAIN ANALYZE), not by intuition
- [ ] Data integrity constraints (UNIQUE, FK, CHECK) defined in schema, not application code
- [ ] The expand-contract pattern is applied for any non-trivial migration during live deployments
