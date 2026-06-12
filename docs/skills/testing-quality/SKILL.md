# SKILL.md

## Metadata
- **Name:** Testing & Quality Strategy
- **Description:** Guides the design, automation, and enforcement of testing practices across the development lifecycle, covering test selection, isolation, coverage thresholds, environment parity, and CI quality gates.

## When to Use
- **USE WHEN:** Designing or refactoring tests for new or existing features; setting up CI pipelines and quality gates; deciding what to test at unit, integration, or end-to-end levels; diagnosing flaky or non-deterministic test failures; establishing testing conventions for a codebase.
- **DO NOT USE FOR:** Debugging production incidents; performance profiling of application code; writing documentation or acceptance criteria; infrastructure provisioning or deployment automation.

## Constraints & Rules
- The test pyramid ratio should target roughly 70% unit, 20% integration, 10% end-to-end. If E2E exceeds 20% of the total, shift investment toward lower-level tests.
- Every test must be fully isolated: no shared mutable state between tests, no implicit ordering dependencies, no reliance on test-A-having-run-before-test-B.
- A test that flakes (passes or fails unpredictably) must be quarantined immediately and excluded from the CI gate. Do not patch around it or retry it in CI.
- Coverage thresholds apply only to unit tests. Above 80% line coverage, each additional point yields diminishing returns — prioritize boundary and edge-case coverage over chasing the last few percentage points.
- Staging and CI environments must mirror production at the dependency level (same database version, same OS image, same external service stubs). Any divergence must be explicitly documented as a known risk.

## Core Principles
- **Test behaviour, not implementation:** Assert against observable outcomes and contract interfaces, not internal method calls or private state. Refactoring the implementation should not break tests that validate the same behaviour.
- **Deterministic tests:** A test given the same inputs must always produce the same result. Eliminate time-based assertions, random data without seeding, and reliance on asynchronous timing windows.
- **Fail fast in CI:** Run the fastest and most specific tests first. If a unit test fails, fail the build immediately — do not continue to run slower integration or E2E suites.
- **Test at the right level:** Verify business logic in unit tests, integration contracts in integration tests, and user journeys in E2E tests. Do not replicate logic coverage across levels.
- **Treat test code as production code:** Apply the same standards for readability, review, linting, and maintainability. Tests that are hard to maintain will be abandoned.

## Workflow
- **Test selection:** Before writing a test, determine which level of the pyramid it belongs to. Factor in: is the test verifying a single unit of logic (unit), a contract between two systems (integration), or a full user workflow (E2E)? Prefer the lowest level that can validate the concern.
- **Test design:** Use Arrange-Act-Assert structure consistently. Name tests by the behaviour under test, not the method name. Avoid branching inside tests — split into separate test cases instead.
- **Test automation:** Every test must be runnable via a single command (e.g., `npm test`). Tests should be grouped into suites by level (unit, integration, e2e) so they can be selectively executed in CI pipelines.
- **Quality gates:** Define pass/fail criteria per pipeline stage: linting and formatting must pass before unit tests; unit tests must pass before integration; integration must pass before E2E. Coverage thresholds should be warnings, not hard gates — except for critical paths where minimum coverage is enforced.

## Anti-patterns
- **Ice-cream cone testing:** Having more E2E tests than unit tests. This fails because E2E tests are slow, brittle, and expensive to maintain, while the fast feedback loop of unit tests is lost. What was overlooked: the cost of feedback latency multiplies with integration depth — each slow E2E test eats into the iteration velocity of the entire team.
- **Testing implementation details:** Writing tests that assert on private methods, internal state, or mock interactions rather than public behaviour. This fails because any refactor breaks the test even when the behaviour is unchanged, creating constant maintenance overhead. What was overlooked: tests are a safety net for behaviour, not a straitjacket for structure.
- **Shared mutable test state:** Using global fixtures, static variables, or database records that tests mutate without cleanup. This fails because test order becomes significant — one test corrupts state for the next, producing non-reproducible failures. What was overlooked: test isolation is not optional; without it, failures become timing-dependent and debugging becomes guesswork.
- **Non-deterministic tests:** Tests that pass or fail based on timeouts, random data, network availability, or concurrency races. This fails because a flaky test erodes trust in the entire suite — developers learn to ignore failures and eventually miss real bugs. What was overlooked: determinism is a prerequisite for any test to be useful; a test that sometimes fails is worse than no test because it creates noise.
- **Over-mocking:** Mocking everything except the unit under test, including value objects, data structures, and simple collaborators. This fails because the test no longer validates real integration behaviour and becomes tightly coupled to the mock setup, breaking on any internal refactor. What was overlooked: mocks are for isolating external boundaries (network, filesystem, time), not for internal objects — prefer real instances for simple types.
