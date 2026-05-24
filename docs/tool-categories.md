# Tool Categories - Capability-Based Index

**Purpose:** Group all available tools by their capability domain so you can discover what tools exist and pick the right one without re-reading all 12 schemas.

**Principle:** One category, one capability family. Tools within a category share a common purpose.

---

## 1. Codebase Inspection

Read and explore the local filesystem and codebase. All tools in this category are **read-only** and support concurrent batching.

| Tool | Quick Purpose |
|------|--------------|
| `read_file_chunk` | Read a line range from a file |
| `get_project_tree` | Walk directory structure (gitignore-aware) |
| `multi_file_search_string` | Search for a string across multiple files by glob |

---

## 2. Web Research

Search the web and fetch external content as clean Markdown.

| Tool | Quick Purpose |
|------|--------------|
| `search_web` | DuckDuckGo search (returns title, URL, snippet) |
| `fetch_url` | Fetch HTML and extract as Markdown; supports batching via `urls[]` |

---

## 3. File Mutation

Create and modify files on disk. These tools require consent when run by the manager agent (sub-agents skip consent). **Blocked in Plan Mode**, except writes targeting the `artifacts/` folder.

| Tool | Quick Purpose |
|------|--------------|
| `patch_file` | Targeted search-and-replace edit in a file |
| `write_or_create_file` | Write/overwrite/append content; supports line-range replace |

---

## 4. System Execution

Run shell commands on the user's terminal. **Blocked in Plan Mode.**

| Tool | Quick Purpose |
|------|--------------|
| `execute_terminal_command` | Run a PowerShell command on Windows |

---

## 5. User Interaction

Prompt the user for decisions during ambiguous situations.

| Tool | Quick Purpose |
|------|--------------|
| `ask_user_preferences` | Ask the user structured multiple-choice questions |

---

## 6. Agent Management

Delegate complex sub-tasks to isolated sub-agents. **Manager-only** - sub-agents do not have access to this tool.

| Tool | Quick Purpose |
|------|--------------|
| `delegate_sub_agent` | Spawn a sub-agent with a definition_of_done, deliverable, and role |

---

## Quick Reference Table

| Tool | Category | Consent | Mutates? | Plan Mode | Batching |
|------|----------|---------|----------|-----------|----------|
| `read_file_chunk` | Codebase Inspection | No | No | Allowed | Concurrent |
| `get_project_tree` | Codebase Inspection | No | No | Allowed | Concurrent |
| `multi_file_search_string` | Codebase Inspection | No | No | Allowed | Concurrent |
| `search_web` | Web Research | No | No | Allowed | Concurrent |
| `fetch_url` | Web Research | Yes (manager) | No | Allowed | Native (`urls[]`) |
| `patch_file` | File Mutation | Yes (manager) | Yes | Blocked* | Sequential |
| `write_or_create_file` | File Mutation | Yes (manager) | Yes | Blocked* | Sequential |
| `execute_terminal_command` | System Execution | Yes (manager) | Yes | Blocked | Sequential |
| `ask_user_preferences` | User Interaction | No | No | Allowed | Concurrent |
| `delegate_sub_agent` | Agent Management | No | No | Allowed | N/A |

*Exempt when writing to `artifacts/` folder (safe workspace for plans).

---

## Recommended Usage Pattern

1. **Exploration phase:** Use Codebase Inspection tools (`get_project_tree` + `multi_file_search_string` + `read_file_chunk`) batched together.
2. **Research phase:** Use Web Research tools (`search_web` → `fetch_url` with `urls[]`).
3. **Discovery:** Read this document to understand what other capability categories are available.
4. **Implementation phase:** Use File Mutation + System Execution as needed.
5. **Ambiguity resolution:** Use `ask_user_preferences` before guessing.
6. **Complex sub-tasks:** Delegate via `delegate_sub_agent` (see `docs/skills/orchestrator/AGENTS.md`).

---

*Part of the tool documentation suite. See also [`docs/README.md`](README.md) for the skills index.*
