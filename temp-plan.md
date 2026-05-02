# Plan: Batch Tool Calls Verification & Error Handling Improvements

## Status: COMPLETE

---

## Investigation Result

**Question: Does batch tool calling send one API request per tool call?**

**Answer: No.** The architecture was already correct: one model API call → N tool calls → all N executed locally → one follow-up API call.

---

## Changes Made

### Issue 1: Structured error returns in `createToolHandler`
**File:** `tools/template.js`
**Change:** `formatError()` and consent denial now return `JSON.stringify({ error: true, tool, message })` instead of plain strings. The model can programmatically detect errors via the `error` field.

### Issue 2: Fragile consent-tool error path + post-hoc sort
**File:** `tools/callToolsInBatch.js`
**Change:** Replaced the two-phase (sequential consent + concurrent read-only) approach with a single `parsed.map()` that builds one promise per tool in original order. Consent tools are serialized via a `consentLock` promise chain; read-only tools run immediately. Results are collected by `Promise.all` in original order — no post-hoc sort needed.

### Issue 3: Missing try/catch around `callToolsInBatch` in orchestrator
**File:** `lib/orchestrator.js`
**Change:** Wrapped `callToolsInBatch` in try/catch. On unhandled exception, pushes structured error messages for all tool_calls so the model can recover gracefully instead of crashing the loop.

### Issue 4: `parseToolCall` returns undefined args on JSON parse failure
**File:** `tools/callToolsInBatch.js`
**Change:** `parseToolCall` now returns `{ name, args, parseError }`. On parse failure, `args` is null and `parseError` contains the message. `callToolsInBatch` checks `parseError` and returns a structured error without attempting execution.

### Issue 5: Missing doc comment clarifying no API calls
**File:** `tools/callToolsInBatch.js`
**Change:** Added header comment explicitly stating: "This module does NOT make model API calls. It only executes local tool handlers."
