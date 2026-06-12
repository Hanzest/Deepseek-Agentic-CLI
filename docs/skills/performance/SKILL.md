# SKILL.md

## Metadata

- **Name:** Performance Engineering
- **Description:** Performance analysis and optimization covering profiling methodology, caching strategy selection, algorithmic complexity evaluation, database query performance, frontend bundle optimization, critical rendering path, and latency budget management.
- **Tags:** performance, profiling, caching, latency, optimization, bundle-size, rendering, algorithmic-complexity, CDN, measurement
- **Version:** 1.0.0

---

## When to Use

- **USE WHEN:** Diagnosing slow user-facing interactions, designing caching layers, evaluating algorithmic efficiency, optimizing database queries, analyzing frontend bundle size, improving page load metrics, or setting performance budgets.
- **DO NOT USE FOR:** Security-driven performance trade-offs (see Security skill — encryption performance cost is non-negotiable), database schema design without performance implications (see Database skill), or UI layout that doesn't involve rendering performance (see UI/UX skill).

---

## Constraints & Rules

- **Measurement must precede optimization:** Any performance optimization applied without a baseline measurement is speculative. The measured baseline defines the actual bottleneck — without it, effort is likely spent on the wrong layer. Profile in a production-like environment with representative data volumes.
- **Latency budgets must be explicit at the architecture level:** Each service, query, and render step should have an allocated latency budget. When a step exceeds its budget, it is a design failure — not a surprise. Budgets force intentionality about where latency is introduced and who is accountable.
- **Caching introduces a consistency vs. performance trade-off:** Every cache layer (CDN, HTTP cache, in-memory cache, database query cache) trades staleness risk for speed. Evaluate cache invalidation strategy (TTL, write-through, write-behind, cache-aside) against the acceptable staleness window. A cache that returns stale data is worse than no cache if correctness matters.
- **The critical rendering path must be analyzed for frontend performance:** First Contentful Paint (FCP), Largest Contentful Paint (LCP), and Cumulative Layout Shift (CLS) are user-centric metrics. Evaluate render-blocking resources, image optimization, font loading strategy, and JavaScript execution order against these metrics.

---

## Core Principles

- **The bottleneck is always somewhere specific:** "Slow" is a symptom, not a diagnosis. Use profiling tools (flame graphs, CPU profiles, heap snapshots, query plans) to identify the single operation consuming the most time or resources. Optimizing non-bottleneck code yields zero user-perceptible improvement.
- **P50, P95, and P99 are different metrics:** The median user experience (P50) is not the worst-case experience (P99). Optimizing for P50 alone ignores tail latency that affects a significant minority of users. Evaluate optimization impact across the entire distribution.
- **Caching is the first optimization to evaluate, not the last:** A well-placed cache (CDN for static assets, HTTP cache for API responses, in-memory cache for computed data) eliminates repeated work at the source. Evaluate caching before code optimization — it often provides 10x improvement with zero algorithmic changes.
- **Bundle size and network transfer are a performance tax:** Every byte shipped to the client costs parse time, download time, and memory. Evaluate whether each dependency, polyfill, and image is necessary for the initial render. Defer non-critical resources via code splitting and lazy loading.
- **Amdahl's Law governs optimization ROI:** The speedup of a system is limited by the fraction of time spent on the improved component. If a function is 10% of total execution time, even a 10x improvement yields only 9% system-level gain. Measure the bottleneck's share before investing.

---

## Workflow

- **Measurement & profiling phase — factors to consider:**
  - What is the user-facing latency target? (e.g., LCP < 2.5s, API P95 < 500ms — define the target before measuring)
  - What profiling tool matches the layer being analyzed? (browser DevTools for frontend, flame graphs for CPU, heap snapshots for memory, EXPLAIN ANALYZE for database, distributed tracing for service-to-service)
  - What is the baseline before any optimization? (record P50/P95/P99, request rates, and resource utilization — the baseline is the only valid comparison point)

- **Caching strategy selection phase — factors to consider:**
  - What data is cacheable? (static content always; computed data if TTL or invalidation key is feasible; user-specific data rarely)
  - What is the acceptable staleness window? (seconds for news feeds, milliseconds for stock prices, never for financial transactions — the staleness tolerance determines cache strategy)
  - What is the cache invalidation mechanism? (TTL for predictable freshness, event-driven invalidation for precision, write-through for consistency — each has operational complexity vs. freshness trade-offs)

- **Frontend optimization phase — factors to consider:**
  - What resources are blocking the initial render? (CSS, JavaScript, fonts — each blocks either rendering or interactivity; evaluate async/defer strategies and critical CSS inlining)
  - Is code splitting applied at route boundaries? (each route should load only its own code — shared modules in a common chunk, route-specific modules deferred)
  - Are images optimized for the viewport? (responsive images with `srcset`, WebP/AVIF formats, lazy loading below-the-fold, aspect ratio boxes to prevent CLS)

---

## Anti-patterns

- **Premature optimization:** Optimizing code before measuring the actual bottleneck. The overlooked factor: developers are poor at predicting where the bottleneck is — profiling reveals the real target; intuition is unreliable.
- **Optimizing for P50 while ignoring P99:** Making the "average" request fast while tail latency grows unbounded under load. The overlooked factor: P99 is the user experience for 1 in 100 requests — high P99 means 1% of users have a bad experience, which can be thousands of users at scale.
- **Cache-as-optimization-panacea:** Adding caching at every layer without understanding invalidation, eviction, or staleness. The overlooked factor: a cache that serves stale data when freshness is required is incorrect behavior, not a performance feature.
- **Measuring in staging and assuming production behavior:** Staging environments rarely have production data volume, traffic patterns, or concurrency. The overlooked factor: bottlenecks often appear only at production scale — measure in production-like conditions or accept that staging results are directional, not definitive.
- **Bundle everything approach:** Shipping all dependencies, all routes, and all images in a single JavaScript bundle. The overlooked factor: every unused byte in the initial bundle delays interactivity — code splitting and tree-shaking are not optional for performance-sensitive applications.

---

## Decision Framework (Conflict Resolution)

| Priority | Principle | Rule | Example |
|----------|-----------|------|---------|
| **1** | **Correctness before speed** | An incorrect fast result is worse than a correct slow one. Never sacrifice correctness for latency. | Cache invalidation must guarantee correctness before considering TTL extension. |
| **2** | **User-perceived metrics** | Optimize metrics users feel (LCP, FCP, API P95) before internal metrics (CPU, memory, disk). | Invest in faster page loads before reducing server CPU. |
| **3** | **Evidence-based optimization** | No optimization without measurement — profile first, optimize second. | Don't refactor a function because "it looks slow" — profile it first. |
| **4** | **Cache before compute** | A cache hit eliminates computation entirely — evaluate caching strategy before code-level optimization. | Add HTTP caching headers before optimizing database queries. |
| **5** | **Developer productivity** | Performance tooling should integrate into the dev workflow, but never at the cost of priorities 1–4. | Use Lighthouse CI to catch regressions in CI before they reach production. |

---

## Self-Check Checklist

- [ ] Performance budget defined (LCP < 2.5s, API P95 < 500ms, or equivalent) before optimization starts
- [ ] Baseline measurements recorded (P50/P95/P99) for all optimizations — no blind changes
- [ ] Caching strategy evaluated with explicit invalidation mechanism and staleness tolerance documented
- [ ] Frontend bundle analyzed for: code splitting at route boundaries, tree-shaking enabled, render-blocking resources minimized
- [ ] Database queries profiled with EXPLAIN ANALYZE — no missing indexes on hot query paths
- [ ] Images optimized: responsive `srcset`, next-gen format (WebP/AVIF), lazy loading for below-the-fold
- [ ] Tail latency (P99) measured alongside average (P50) — not optimizing for the median alone
