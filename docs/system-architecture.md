# System Architecture - Codebase Structure Overview

**Date:** 2026  
**Scope:** All source files under `main.js`, `lib/`, `tools/`  
**Principle Baseline:** DRY, SOLID (SRP/OCP), Testability, Maintainability

---

## 1. Executive Summary

The codebase has been fully refactored from its original monolithic prototype (`mainAPI.js` + `helper.js` + `modelTool.js`) into a modular, single-responsibility architecture. Every logical concern now lives in its own file, and boilerplate is eliminated via a shared `createToolHandler()` factory.

| Metric | Before Refactor | After Refactor |
|-------|--------------|---------------|
| Files with >1 responsibility | 3 / 3 | 0 / 7 |
| Duplicated consent/error/logic patterns | 3 copies | 1 shared wrapper (`tools/template.js`) |
| Lines per "tool unit" | 712 (single `modelTool.js`) | ~40-170 per file |
| Effort to add a new tool | Append 100+ lines to monolith | Create 1 file + 1-line registry entry |

---

## 2. Directory Structure

```
Deepseek_Chatbot/
|-- main.js                  Entry point (thin: parse args, start orchestrator)
|-- lib/
|   |-- tokenizer.js         estimateTokens() + helpers (pure, no I/O)
|   |-- cliInput.js          ask(), startChat(), thinkingToggle() (I/O-bound)
|   |-- streamHandler.js     printStreamResponse() (stream-to-data parser)
|   |-- orchestrator.js      multiTurnLoop(), callModel(), runChat()
|-- tools/
|   |-- registry.js          TOOL_REGISTRY (central map: name -> [schema, handler])
|   |-- template.js          createToolHandler() (DRY wrapper: log + consent + try/catch)
|   |-- executeTerminal.js   Shell execution (consent required)
|   |-- patchFile.js         Search-and-replace file editing (consent required)
|   |-- readFileChunk.js     Line-range file reading (read-only)
|   |-- getProjectTree.js    Directory tree walk with gitignore awareness (read-only)
|   |-- searchWeb.js         DuckDuckGo search (read-only)
|   |-- fetchUrl.js          URL fetch -> Markdown extraction (consent required)
|   |-- askUserPreferences.js Multi-question preference prompt (read-only)
|-- docs/
|   |-- agents.md            Agent guidelines (path conventions, consent model, etc.)
|   |-- system-architecture.md (this file)
|-- package.json
```

---

## 3. Module Responsibilities

### 3.1 `main.js` (7 lines)
- **Role:** Entry dispatch only.
- Imports `runChat()` from `lib/orchestrator.js` and invokes it. No other logic.

### 3.2 `lib/orchestrator.js` (288 lines)
- **Role:** Application orchestration (the "brain").
- Sets up OpenAI client, loads config, defines hyperparameters.
- `runChat()` - top-level entry: calls model selection + thinking toggle, then starts loop.
- `multiTurnLoop()` - conversation orchestrator with sliding context window, inner tool-execution loop, and per-iteration telemetry.
- `callModel()` - thin wrapper over `OpenAI.chat.completions.create()`.

### 3.3 `lib/tokenizer.js` (155 lines)
- **Role:** Pure token estimation (no I/O side effects).
- Initialises `tiktoken` encoder with fallback heuristic.
- `estimateTokens(messages, reasoning_history, token_multiplier)` - iterates messages, sums input/output tokens accounting for tool calls, reasoning history, and structural overhead.

### 3.4 `lib/cliInput.js` (58 lines)
- **Role:** I/O-bound user interaction.
- `ask(question)` - wraps `readline.question()` in a Promise.
- `startChat()` - model selection menu (1. flash, 2. pro).
- `thinkingToggle()` - reasoning content enable/disable menu.

### 3.5 `lib/streamHandler.js` (62 lines)
- **Role:** Streaming response parser.
- `printStreamResponse(stream, extra_body)` - async generator consumer that returns `{ reasoning_content, content, tool_calls }`.
- Handles thinking content, standard content, and incremental tool-call assembly from chunks.

### 3.6 `tools/template.js` (50 lines)
- **Role:** DRY boilerplate factory.
- `createToolHandler(name, handlerFn, needsConsent)` - wraps any pure handler with:
  1. Console alert (tool name + truncated args)
  2. Optional user consent prompt (`y/nh)
  3. `try/catch` with formatted error return

### 3.7 `tools/registry.js` (42 lines)
- **Role:** Central tool map.
- Imports all schemas and wrapped handlers; exports `TOOL_REGISTRY` - a `Map<string, [schema, handler]>`.
- Adding a new tool = 1 import + 1 map entry. No modification of existing code.

---

## 4. Data Flow

```
User Input
    |
    v
cliInput.ask()  --->  orchestrator.multiTurnLoop()
                        |
                        v
                    callModel() ---> OpenAI API (streaming)
                        |
                        v
                    streamHandler.printStreamResponse()
                        |
                        +-> reasoning_content (printed if enabled)
                        +-> content (printed)
                        +-. tool_calls (if any)
                        |
                        v
                    tool_calls?
                        |                  |
                   YES                  NL
                        |                  |
                        v                    v
              Luckup in TOOL_REGISTRY    Wait for next user input
                        |
                        v
              template.createToolHandler()
                  |            |
               consent?     no consent?
                  |            |
               (y/n)       skip prompt
                  |            |
                  v            v
              handler(args)  handler(args)
                  |            |
                  v            v
              Push result as {role:"tool"}
                        |
                        v
              Loop back: callModel() again
```

---

## 5. Security Model

| Vector | Protection |
|-------|-----------|
| `.env` file read | **Auto-blocked** in `readFileChunk.js` -- cannot read `.env` under any condition |
| `.env` in terminal commands | **Warn + consent** in `executeTerminal.js` -- prints warning and asks `y/n` before executing any command referencing `.env` |
| `.env` file patch/write | **Warn + consent** in `patchFile.js` -- prints warning and asks `y/n` before patching a `.env` file |
| Dangerous shell patterns | Blocked in `executeTerminalCore` before execution |
| Destructive operations | `fetch_url` requires user consent via `createToolHandler(..., true)`; `execute_terminal_command` and `patch_file` are auto-approved except when `.env` is involved |
| Read-only operations | `read_file_chunk` (auto-blocked for `.env`), `get_project_tree`, `search_web`, `ask_user_preferences` run without consent |

---

## 6. Open/Closed Principle (OCP) Impact

Adding a new tool is strictly additive:

1. **Add** `tools/newTool.js` - define schema + pure handler function
2. **Add** 1 line to `tools/registry.js` - import + map entry

Zero modification of existing tool logic. Zero risk of breaking existing tools.

---

## 7. Testability

| Scenario | What to Import |
|---------|------------|
| Unit-test token estimation | `lib/tokenizer.js` (pure, no mock needed) |
| Unit-test a tool handler | Individual `tools/*.js` handler function (no I/O coupling) |
| Integration-test orchestration | `lib/orchestrator.js` directly |
| Test stream parsing | `lib/streamHandler.js` with mock async iterable |

---

## 8. Dependencies

| Package | Used By | Purpose |
|--------|----------|----------|
| `openai` | `lib/orchestrator.js` | OpenAI-compatible API client |
| `dotenv` | `lib/orchestrator.js` | Load config |
| `tiktoken` | `lib/tokenizer.js` | Accurate token counting |
| `ignore` | `tools/getProjectTree.js` | gitignore-aware directory traversal |
| `cheerio` | `tools/fetchUrl.js` | HTML parsing |
| `turndown` | `tools/fetchUrl.js` | HTML-to-Markdown conversion |
| `duck-duck-scrape` | `tools/searchWeb.js` | Web search via DuckDuckGo |

*End of system architecture document.

