# Using Tools — Batch-First Strategy for Minimal API Round-Trips

**Target:** All agents (manager and sub-agents).  
**Principle:** Every tool call that doesn't depend on a previous result should be dispatched in the same `tool_calls` array. The runtime executes read-only tools concurrently and consent tools sequentially within a single API round-trip.

---

## 1. Why Batch Matters

Each tool-calling turn costs:

| Cost | Per-Turn Impact |
|------|----------------|
| **API latency** | ~1–3 seconds per round-trip |
| **Input tokens** | Full message history re-sent every turn |
| **Output tokens** | Model re-generates reasoning + content each turn |
| **Context pressure** | Each turn adds assistant + tool messages to history |

Dispatching N independent tools in one turn costs **1 API call** instead of N. For 5 independent reads, batching saves ~4 API calls, ~4x token overhead, and ~4x wall-clock time.

---

## 2. Which Tools Support Batching

### 2.1 Native Batch Mode: `fetch_url`

`fetch_url` accepts either `url` (single) or `urls` (array). **Always prefer `urls`** when fetching multiple pages:

```
// GOOD — 1 tool call, N URLs fetched concurrently
fetch_url({ urls: ["https://a.com", "https://b.com", "https://c.com"] })

// BAD — 3 sequential tool calls
fetch_url({ url: "https://a.com" })
fetch_url({ url: "https://b.com" })
fetch_url({ url: "https://c.com" })
```

When both `url` and `urls` are provided, `url` is appended to the batch. You can fetch up to ~10 URLs in a single call before hitting practical limits.

### 2.2 Co-Dispatch Compatible Tools

All tools can be co-dispatched in a single `tool_calls` array. The runtime (`callToolsInBatch`) sorts them into:

- **Sequential queue:** tools with `needsConsent = true` (`execute_terminal_command`, `patch_file`, `fetch_url`, `write_or_create_file`)
- **Concurrent pool:** read-only tools (`read_file_chunk`, `get_project_tree`, `search_web`, `multi_file_search_string`, `ask_user_preferences`)

Consent tools still prompt the user one at a time (so prompts don't interleave), but all their results go back to the model in ONE follow-up call.

---

## 3. The Dependency Rule

| Situation | Strategy |
|-----------|----------|
| Tools are **independent** (B doesn't need A's output) | Dispatch together in ONE `tool_calls` array |
| Tool B needs Tool A's **output** as input | Two turns: A first, then B with A's result |
| Tools target **different files** | Batch them (even writes to different files) |
| Tools target the **same file** | Sequential — second tool must see first tool's result |
| One tool **validates** another's output | Must be sequential — validator needs the output |

---

## 4. Strategic Phased Patterns

### 4.1 Exploration Phase

Goal: understand the codebase. All tools are read-only and independent — dispatch them together.

```
Turn 1 (batch):
  get_project_tree()              // see structure
  multi_file_search_string({      // find relevant code
    search_string: "functionName"
  })
  read_file_chunk({               // read key file
    file_path: "src/main.js",
    start_line: 1,
    end_line: 50
  })
```

### 4.2 Research Phase

Goal: gather external information. `search_web` + `fetch_url` (native batch).

```
Turn 1 (batch):
  search_web({ query: "React 18 Server Components patterns" })
  search_web({ query: "Next.js app router caching" })
  // search_web results return...

Turn 2 (batch using urls[]):
  fetch_url({
    urls: ["https://result1.com", "https://result2.com", "https://result3.com"]
  })
```

If you already know the URLs, skip `search_web` and go straight to `fetch_url` with `urls[]`.

### 4.3 Implementation Phase

Goal: make changes. Writes to different files can batch. Writes to the same file must be sequential.

```
// GOOD — two different files, one turn
Turn N (batch):
  write_or_create_file({ file_path: "src/a.js", content: "..." })
  write_or_create_file({ file_path: "src/b.js", content: "..." })

// REQUIRED — same file needs two turns
Turn N:
  write_or_create_file({ file_path: "src/a.js", content: "..." })
Turn N+1:
  patch_file({ file_path: "src/a.js", ... })
```

### 4.4 Verification Phase

Goal: confirm changes. Read multiple files in one turn.

```
Turn N (batch):
  read_file_chunk({ file_path: "src/a.js", start_line: 1, end_line: 30 })
  read_file_chunk({ file_path: "src/b.js", start_line: 1, end_line: 30 })
  read_file_chunk({ file_path: "docs/README.md", start_line: 1, end_line: 50 })
```

---

## 5. Anti-Patterns

| Anti-Pattern | Cost | Fix |
|-------------|------|-----|
| 5 `read_file_chunk` calls in 5 turns | 5 API calls, 5x tokens | 1 turn with 5 tool_calls |
| `fetch_url` called once per URL | N API calls | `fetch_url({ urls: [...] })` |
| `get_project_tree` then wait, then `multi_file_search_string` | 2 API calls | Dispatch together — they're independent |
| `search_web` → read result → `search_web` again | 2 API calls for parallel queries | Batch both `search_web` calls in one turn |
| `write_or_create_file` → `read_file_chunk` to verify same file | Wastes a turn if write succeeded | Only verify if you have reason to suspect failure |
| Using `execute_terminal_command` for `dir`/`ls` | Consent prompt overhead | Use `get_project_tree` (read-only, no consent) |

---

## 6. Token Economics

| Pattern | Turns | Approx. Input Tokens | Savings vs Naive |
|---------|-------|---------------------|------------------|
| 5 independent reads, batched | 1 | ~2,000 | ~8,000 tokens (4 turns saved) |
| 3 URLs, native batch | 1 | ~1,500 | ~3,000 tokens (2 turns saved) |
| Explore: tree + search + read | 1 | ~1,500 | ~4,500 tokens (3 turns saved) |
| 5 independent reads, sequential | 5 | ~10,000 | — (baseline: wasteful) |

**Rule of thumb:** Each avoided turn saves roughly the full message history in input tokens plus the model's response tokens. For a conversation with ~3,000 tokens of history, saving 3 turns = ~9,000 input tokens + ~1,500 output tokens = ~10,500 tokens saved.

---

## 7. Quick Reference Checklist

Before dispatching any tool call, ask:

- [ ] Can I dispatch **any other tool** in this same turn?
- [ ] Are any of these tools **independent** of each other's outputs?
- [ ] If using `fetch_url`, can I use the `urls[]` array form?
- [ ] If reading multiple files, can I batch all `read_file_chunk` calls?
- [ ] If exploring, can I combine `get_project_tree` + `multi_file_search_string` + `read_file_chunk`?
- [ ] Is the **next** tool I plan to call actually dependent on this result, or can I dispatch it now?

**Default posture:** Batch-first. Only go sequential when the dependency chain demands it.

---

*Part of the skills documentation suite. See also [`docs/README.md`](../README.md) for the skills index.*
