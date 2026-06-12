# SKILL.md

## Metadata

- **Name:** Observability, Logging & Incident Response
- **Description:** Production visibility covering structured logging, log levels and sampling, distributed tracing (OpenTelemetry), metrics definition (RED/USE methods), alert design, runbook creation, and incident response lifecycle.
- **Tags:** observability, logging, metrics, tracing, OpenTelemetry, alerting, monitoring, incident-response, runbook, SLI
- **Version:** 1.0.0

---

## When to Use

- **USE WHEN:** Adding logging to a new service or feature, designing monitoring dashboards, defining SLIs/SLOs, creating alert rules, writing incident response runbooks, implementing distributed tracing, or diagnosing production issues where existing observability is insufficient.
- **DO NOT USE FOR:** Debugging during local development (which should use a debugger, not observability tooling), performance profiling (see Performance Engineering skill), or security audit logging that requires specific compliance formats (see Security skill).

---

## Constraints & Rules

- **Logs must be structured — never plain text or `console.log`:** Structured logs (JSON, key=value) enable programmatic filtering, alerting, and analysis. Plain-text logs require regex parsing, break on multi-line messages, and cannot be reliably searched. Evaluate a structured logging library that supports automatic context injection (request ID, service name, environment).
- **Log levels define actionability:**
  - `ERROR`: Something is broken and needs human investigation. Must include stack trace, correlation ID, and enough context to reproduce.
  - `WARN`: Something unexpected but handled (retry succeeded, fallback used). May need investigation if frequency spikes.
  - `INFO`: Confirmation of normal lifecycle events (startup, shutdown, successful request). Must be high-signal, low-volume.
  - `DEBUG`: Detailed diagnostic information. Must be toggleable at runtime and never enabled in production by default.
  - `TRACE`: Step-by-step execution trace for a single operation. Use with distributed tracing, not log volume.
- **Every log line must be traceable to a request:** A correlation ID (trace ID, request ID) must be propagated from the entry point through every downstream service. Logs without correlation IDs cannot be assembled into a coherent view of a multi-service operation.
- **Dashboards must answer a question, not display every metric:** A dashboard with 20 charts and no clear purpose is noise. Every chart on the dashboard should correspond to an SLI that matters for the service's SLOs. Evaluate dashboard efficacy by whether it shortens time-to-diagnosis.

---

## Core Principles

- **Three pillars are complementary, not redundant:** Logs tell you what happened, metrics tell you how many times it happened, traces tell you where in the request flow it happened. Choose the pillar based on the question type: metrics for trends, logs for events, traces for causality.
- **RED method for request-driven services:** Rate (requests/sec), Errors (failed requests/sec), Duration (latency distribution — P50, P95, P99). Covers the majority of service health questions with three metrics. USE method for resource-driven services: Utilization, Saturation, Errors (CPU, memory, disk, network).
- **Alert on symptoms, not causes:** Alert when users are affected (high latency, error rate spike), not when internal conditions change (CPU > 80%). Symptom-based alerts are immediately actionable; cause-based alerts fire for harmless fluctuations and train engineers to ignore them.
- **Runbooks must be written before the incident:** A runbook for a known failure mode (database connection pool exhaustion, certificate expiry, disk space) should exist and be tested before the first incident. Incident response time is dominated by diagnosis; runbooks compress diagnosis to lookup time.
- **Blameless postmortems drive improvement:** Every incident should produce a postmortem that identifies the systemic gap (not the human error) and results in a specific, tracked action item. If the same incident happens twice, the fix didn't address the root cause.

---

## Workflow

- **Instrumentation phase — factors to consider:**
  - What is the minimum set of logs required to debug a request end-to-end? (entry/exit points, external calls with duration, errors with context — too much logging adds cost and noise)
  - Which metrics capture service health with the fewest signals? (RED: rate, errors, duration for request-driven; USE: utilization, saturation, errors for resource-driven)
  - Is distributed tracing configured for all service-to-service calls? (OpenTelemetry auto-instrumentation covers most entry points; manual spans needed for custom async boundaries)

- **Alert design phase — factors to consider:**
  - What is the burn rate for each SLO? (fast burn = immediate page; slow burn = daytime ticket; evaluate alert threshold sensitivity to avoid noise)
  - Does the alert have a corresponding runbook? (every paging alert must link to a runbook — if no runbook exists, the alert is not ready for production)
  - What is the escalation path if the alert is not acknowledged? (primary → secondary → on-call manager — each level with defined response time)

- **Incident response phase — factors to consider:**
  - What is the severity classification? (SEV1: users blocked; SEV2: degraded; SEV3: minor — each has different response time expectations and notification channels)
  - What communication channel is established? (dedicated incident Slack/Discord channel with automated updates, status page for external communication)
  - What artifacts must be preserved for postmortem? (timeline of actions, command outputs, log extracts, dashboards — preserve before remediation)

---

## Anti-patterns

- **console.log in production:** Unstructured, untagged, no correlation ID, no log level. The overlooked factor: unstructured logs cannot be reliably searched, filtered, or alerted on — they are noise, not observability.
- **Logging everything "just in case":** Logging every variable, every branch, every function call at INFO level. The overlooked factor: log volume has a cost (storage, throughput, noise filtering) — log what is actionable, not what is available.
- **Dashboards as wallpaper:** A wall of charts that nobody uses during an incident. The overlooked factor: a dashboard's value is measured by whether it shortens diagnosis time, not by how many metrics it displays.
- **Paging on cause instead of symptom:** Alerting on CPU > 80% instead of error rate > 1%. The overlooked factor: high CPU is not inherently user-impacting; high error rate is. Page on the symptom, investigate the cause.
- **Silently swallowing errors:** Catching exceptions and logging nothing, or logging a generic "something went wrong" without context. The overlooked factor: swallowed errors are invisible until they cascade into an unrecoverable state — always log error context and consider alerting on unexpected exceptions.

---

## Decision Framework (Conflict Resolution)

| Priority | Principle | Rule | Example |
|----------|-----------|------|---------|
| **1** | **User impact detection** | Alert when users are affected, not when internal conditions change. | Page on error rate spike, not on disk usage at 70%. |
| **2** | **Actionable signals** | Every log line, metric, and alert must drive an action or decision. | Remove metrics that have never triggered an investigation. |
| **3** | **Correlation** | All signals for one request must be joinable via a common correlation ID. | Never log without a request ID. |
| **4** | **Cost efficiency** | Observability has storage and compute costs — sample high-volume, low-signal data. | Sample DEBUG logs at 1%; keep 100% of ERROR logs. |
| **5** | **Tooling convenience** | Dashboards and alerting tools should reduce friction, never at cost of priorities 1–4. | Auto-generate dashboards from metric definitions, not manually. |

---

## Self-Check Checklist

- [ ] All logs are structured (JSON or key=value) with a correlation ID — no `console.log`
- [ ] Log levels are used consistently: ERROR for failures, WARN for handled exceptions, INFO for lifecycle events, DEBUG toggleable at runtime
- [ ] Every paging alert has an associated runbook that is tested and linked in the alert
- [ ] RED metrics (rate, errors, duration) defined for each request-driven service; USE metrics for resource-driven services
- [ ] Distributed tracing configured for all service-to-service boundaries
- [ ] Dashboards are reviewed for unused charts (if no one looks at it, remove it)
- [ ] Postmortems produced after every incident with tracked action items
