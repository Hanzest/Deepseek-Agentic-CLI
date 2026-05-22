# Tool Usage Conventions

Consolidated rules for all agents (manager and sub-agents).

---

## Must Do

| # | Rule |
|---|------|
| 1 | Dispatch **all independent tools in a single `tool_calls` array** — the runtime executes read-only tools concurrently and consent tools sequentially within one round-trip |
| 2 | Use `fetch_url({ urls: [...] })` for multiple URLs — never call `fetch_url` once per URL |
| 3 | Use `get_project_tree` for filesystem exploration — never `execute_terminal_command` with `dir`/`ls` |
| 4 | Run `search_web` calls in parallel (same turn) when queries are independent |
| 5 | Dispatch writes to **different files** together in one turn |
| 6 | Sequence writes to the **same file** across separate turns |
| 7 | Sequence tools where one **validates** another's output |
| 8 | Use `patch_file` for targeted edits of ~20 lines or fewer |
| 9 | Use `write_or_create_file` for new files, complete rewrites, or large-scale changes |
| 10 | All tool paths must be **relative to project root** |
| 11 | Always use `-Encoding UTF8` with `Set-Content` in PowerShell |
| 12 | Use plain ASCII in source files: `--`, `"`, `'` — no em dashes, smart quotes, or non-ASCII |

---

## Should Do

| # | Rule |
|---|------|
| 1 | Batch Exploration Phase tools: `get_project_tree` + `multi_file_search_string` + `read_file_chunk` in one turn |
| 2 | Batch Research Phase: `search_web` calls together, then `fetch_url({ urls: [...] })` for all results |
| 3 | Batch Verification Phase: read multiple files in one turn |
| 4 | Skip `search_web` and go directly to `fetch_url({ urls: [...] })` when URLs are already known |
| 5 | Prefer `read_file_chunk` over full-file reads when only a specific range is needed |
| 6 | Use the checklist before dispatching: can any other tool go in this same turn? |
| 7 | Treat batch-first as the **default posture** — go sequential only when dependencies demand it |

---

## Must Not

| # | Prohibited Action |
|---|-------------------|
| 1 | Read `.env` via `read_file_chunk` (auto-blocked) |
| 2 | Include `.env` content in responses or logs |
| 3 | Use Unix commands (`rm`, `ls`, `cat`, `grep`) in `execute_terminal_command` — the shell is **PowerShell** |
| 4 | Use `execute_terminal_command` for filesystem exploration — use `get_project_tree` |
| 5 | Write to `.env` without explicit `y/n` consent (both `patch_file` and `write_or_create_file` block it) |
| 6 | Use em dashes, smart quotes, emojis, long hyphens, `---`, `===`, or `***` in any output |

---

## Should Not

| # | Discouraged Pattern | Preferred Alternative |
|---|---------------------|-----------------------|
| 1 | Calling `read_file_chunk` one file at a time across multiple turns | Batch all independent reads in one turn |
| 2 | `fetch_url({ url: "..." })` per URL | `fetch_url({ urls: [...] })` |
| 3 | `get_project_tree` then wait, then `multi_file_search_string` | Dispatch together — they are independent |
| 4 | `search_web` then read result then `search_web` again for parallel queries | Batch both `search_web` calls |
| 5 | `write_or_create_file` then immediately `read_file_chunk` to verify | Only verify if there is reason to suspect failure |
| 6 | Using `execute_terminal_command` for read-only inspection | Use `get_project_tree` or `read_file_chunk` |

---

## Justification

### Batch-First Strategy (Must Do #1, Should Do #1-#7, Must Not #4, Should Not #1-#6)

Each tool-calling turn costs ~1-3 seconds of API latency plus the full message history in input tokens plus the model's response tokens. Dispatching N independent tools in one turn costs **1 API call** instead of N. For 5 independent reads, batching saves ~4 API calls, ~4x token overhead, and ~4x wall-clock time. The runtime's `callToolsInBatch` already sorts tools into concurrent (read-only) and sequential (consent) pools, so there is no reason to manually sequence independent calls.

### Dependency Rule (Must Do #5-#7)

Tools that target different files cannot interfere with each other — they can safely batch. Tools that target the same file need sequential turns so the second sees the first's result. Similarly, validation must follow the write it validates.

### fetch_url Batch (Must Do #2, Should Do #4, Should Not #2)

`fetch_url` natively accepts a `urls[]` array for concurrent fetching. Calling it once per URL wastes N-1 round-trips.

### Tool Selection (Must Do #3, #8, #9, Must Not #4, Should Not #6)

- `get_project_tree` is read-only, respects `.gitignore`, and never requires consent — unlike `execute_terminal_command` for `dir`/`ls`.
- `patch_file` transmits only the diff, saving tokens. `write_or_create_file` sends the full file content. For edits of ~20 lines or fewer, the diff approach is significantly cheaper.
- For filesystem exploration, read-only tools avoid unnecessary consent prompts.

### Path Conventions (Must Do #10)

All tool paths are relative to the project root. The runtime sets the working directory via `process.chdir()` in `lib/orchestrator.js`. Relative paths keep tool calls portable and concise.

### Encoding and Style (Must Do #11, #12, Must Not #6)

The shell is Windows PowerShell. `Set-Content` without `-Encoding UTF8` may produce unexpected character encoding. Non-ASCII characters (em dashes, smart quotes, emojis) can cause parsing issues in source files and degrade compatibility across editors and terminals.

### .env Security (Must Not #1, #2, #5)

The `.env` file contains API keys and is git-ignored. `read_file_chunk` auto-blocks it. The consent tools (`execute_terminal_command`, `patch_file`, `write_or_create_file`) require explicit `y/n` consent when targeting `.env`. Never log or expose its contents.

### PowerShell (Must Not #3)

The user's shell is Windows PowerShell. Unix commands (`rm`, `ls`, `cat`) will fail. Use `Remove-Item`, `Get-ChildItem`, `Get-Content`, `Set-Content`, `2>&1` for stderr redirection, backtick `` ` `` for line continuation, and `$env:VAR_NAME` for environment variables.

### Plan Mode vs Agent Mode (contextual — not in rule tables)

The system starts in Plan Mode by default. Plan Mode blocks file mutation (`patch_file`, `write_or_create_file`) and system execution (`execute_terminal_command`), with writes to `artifacts/` exempted. Agent Mode allows all tools. Sub-agents inherit the manager's mode and cannot bypass it. The mode state is stored as `SessionContext.agentMode` in `lib/orchestrator.js`.

### Token Economics (Should Not #5)

Each avoided turn saves roughly the full message history in input tokens plus the model's response tokens. A write-then-verify pattern adds an unnecessary turn when the write tool itself reports success. Only verify when there is a specific reason to suspect failure.
