# API Timeout Configuration

## Overview

The gateway enforces a default request timeout of 30 seconds. For long-running
batch endpoints this can be raised per-route via the `timeout_ms` field.

## Settings

- `timeout_ms`: 30000 (default)
- `retry_count`: 3
- `circuit_breaker_threshold`: 5 failures in 60 seconds

## Tuning

Raise `timeout_ms` when the upstream service performs heavy aggregation.
Lower `retry_count` for idempotent endpoints to reduce load during outages.
