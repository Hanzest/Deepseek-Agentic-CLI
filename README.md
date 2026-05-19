# DeepSeek Chatbot — Multi-Turn CLI with Tool-Use & Sub-Agent Delegation

A modular, multi-turn conversational chatbot powered by **DeepSeek models** via an OpenAI-compatible API.  
The chatbot runs in the terminal and supports **streaming responses**, **reasoning/thinking content**, **sliding context windows**, **10 built-in tool-use capabilities**, and a **sub-agent delegation system** for complex multi-step tasks.

## Features

- **Multi-turn conversation** — persistent chat history with automatic context window management.
- **Streaming output** — real-time token-by-token display of model responses.
- **Reasoning content** — optional display of the model's chain-of-thought / thinking blocks.
- **Tool-use agent loop** — the model can autonomously invoke tools in parallel, receive results, and continue the conversation.
- **Sub-agent delegation** — spawn independent terminal windows running isolated model loops for complex sub-tasks, with full context isolation.
- **Token estimation** — real-time input/output token counts powered by `tiktoken` (with heuristic fallback).
- **Sliding context window** — when approaching the token limit, older messages are pruned while preserving conversation integrity.
- **Colour-coded terminal output** — clear visual distinction between reasoning, model output, tool alerts, batch summaries, and errors.
- **Modular architecture** — single-responsibility files, DRY boilerplate via a tool handler factory, and an Open/Closed principle-friendly tool registry.

## Project Structure

```
Deepseek_Chatbot/
├── .gitignore
├── .env                    # API configuration (git-ignored)
├── main.js                 # Entry point (7 lines: imports runChat, invokes it)
├── package.json
├── README.md
├── lib/
│   ├── orchestrator.js     # Chat loop, model invocation, sliding context, tool orchestration
│   ├── tokenizer.js        # Pure token estimation (tiktoken + heuristic fallback)
│   ├── cliInput.js         # User I/O prompts (model selection, thinking toggle, ask)
│   ├── streamHandler.js    # Streaming response parser (reasoning, content, tool calls)
│   ├── subAgentLoop.js     # Independent model loop for sub-agents (uses SUBAGENT_TOOLS)
│   └── subAgentTerminal.js # Spawn and manage dedicated terminal windows for sub-agents
├── tools/
│   ├── registry.js         # Central tool map — exports WORKER_TOOLS, SUBAGENT_TOOLS, MANAGER_TOOLS
│   ├── template.js         # createToolHandler() factory — DRY log + consent + try/catch wrapper
│   ├── callToolsInBatch.js # Batch execution engine (consent tools serial, read-only concurrent)
│   ├── executeTerminal.js  # Shell command execution
│   ├── patchFile.js        # Targeted string search-and-replace in a file
│   ├── readFileChunk.js    # Read a range of lines from a file
│   ├── getProjectTree.js   # Directory tree walk respecting .gitignore
│   ├── searchWeb.js        # Web search via DuckDuckGo
│   ├── fetchUrl.js         # Fetch URL → clean Markdown extraction
│   ├── askUserPreferences.js # Multi-question preference prompts
│   ├── writeOrCreateFile.js  # Write or create files (with parent directory creation)
│   ├── multiFileSearchString.js # Search for a string across multiple files with glob support
│   └── delegateSubAgent.js # Delegate a sub-task to an isolated sub-agent in a new terminal
└── docs/
    ├── agents.md           # Agent guidelines (path conventions, consent model, encoding rules)
    ├── tool-categories.md  # Tools grouped by capability domain
    └── skills/
        ├── managing_agents.md  # Delegation patterns and best practices
        └── using_tools.md      # Batch-first tool-calling strategy
```

## Requirements

- Node.js 18+
- A DeepSeek (or compatible) API key and base URL

### JavaScript Dependencies

Install with:

```powershell
npm install
```

| Package | Purpose |
|---------|---------|
| `openai` | OpenAI-compatible API client for DeepSeek models |
| `dotenv` | Load environment variables |
| `tiktoken` | Accurate token counting |
| `ignore` | `.gitignore`-aware directory traversal |
| `cheerio` | HTML parsing for URL content extraction |
| `turndown` | HTML-to-Markdown conversion |
| `duck-duck-scrape` | Web search via DuckDuckGo |

## Setup

1. **Clone the repository** and navigate to the project root directory.

2. **Create a `.env` file** in the project root with the following:

   ```env
   DEEPSEEK_API_KEY=your_api_key_here
   DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
   ```

   > The `.env` file is git-ignored and must never be committed.

3. **Install dependencies**:

   ```powershell
   npm install
   ```

## Usage

Run the chatbot from the project root:

```powershell
node main.js
```

### Startup Prompts

1. **Model selection** — choose between available DeepSeek models (e.g. `deepseek-v4-flash`, `deepseek-v4-pro`).
2. **Reasoning toggle** — enable or disable the display of chain-of-thought / thinking content.

### Conversation Loop

- Type your message and press **Enter**.
- The model may respond with text, and/or invoke one or more **tools** (with your approval for consent-required tools).
- Tool results are fed back to the model, which can then respond or call additional tools.
- The model may also **delegate sub-tasks** to specialised sub-agents, which open independent terminal windows.
- Type **`exit`** to end the conversation.

The token estimates (input/output/total) are displayed before each user prompt, and the context window automatically slides (removing older messages) when usage exceeds 80% of the configured token limit.

## Built-in Tools

The model has access to the following **10 tools**. Tools that modify the system or make network requests require explicit **user consent** (`y/n` prompt) before execution. Read-only tools run autonomously.

| Tool | Description | Consent Required |
|------|-------------|:---:|
| `execute_terminal_command` | Execute any PowerShell command on the user's machine | ✅ Yes |
| `patch_file` | Perform a targeted string search-and-replace in a file | ✅ Yes |
| `read_file_chunk` | Read a range of lines from a file (with line numbers) | ❌ No |
| `get_project_tree` | Walk the project directory tree, respecting `.gitignore` | ❌ No |
| `search_web` | Search the web via DuckDuckGo | ❌ No |
| `fetch_url` | Fetch a URL and extract clean Markdown content | ✅ Yes |
| `ask_user_preferences` | Ask the user a series of preference questions | ❌ No |
| `write_or_create_file` | Write or create files, with optional parent directory creation | ✅ Yes |
| `multi_file_search_string` | Search for a string across multiple files with glob support | ❌ No |
| `delegate_sub_agent` | Delegate a complex sub-task to a specialised sub-agent in an isolated terminal | ❌ No |

### Tool Registries

Three tool registries control which tools are available to which agent:

| Registry | Contents | Used By |
|----------|----------|---------|
| `WORKER_TOOLS` | 9 tools (all except `delegate_sub_agent`), with consent flags | Sub-agents (prevent infinite delegation chains) |
| `SUBAGENT_TOOLS` | Same 9 tools as `WORKER_TOOLS`, but all consent flags set to `false` | Sub-agent loops (autonomous, no per-tool prompts) |
| `MANAGER_TOOLS` | All 10 tools = `WORKER_TOOLS` + `delegate_sub_agent` | Main orchestrator / manager agent |

### Sub-Agent Delegation System

When the model encounters a complex multi-step task (e.g., refactoring a module, writing documentation, auditing code), it can use the `delegate_sub_agent` tool to:

1. Generate a structured Markdown prompt file with the sub-agent's goal, purpose, deliverables, skills, and context.
2. Spawn an **independent PowerShell terminal window** via `subAgentTerminal.js`.
3. Run a **separate model loop** (`subAgentLoop.js`) in that window with its own context, using `SUBAGENT_TOOLS` (9 tools, all consent-free).
4. The sub-agent operates autonomously, writing results back to the project files.
5. The main agent continues its own conversation in the original terminal, checking the sub-agent's output when done.

This provides **true context isolation** — the sub-agent's token budget, message history, and reasoning do not consume the main agent's context window.

### Security

- Dangerous command patterns (e.g. `Get-Content *`) are blocked before execution.
- All destructive/network operations prompt the user for approval before proceeding.
- Sub-agents operate in independent terminal windows; all their tool calls are still logged to stdout via `callToolsInBatch`.

## Configuration

Hyperparameters are defined in `lib/orchestrator.js` under the `HYPERPARAMETERS` object:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `token_limit` | 200000 | Maximum tokens per request |
| `token_multiplier` | 1.5 | Fallback multiplier for heuristic token estimation |
| `stream` | `true` | Enable streaming responses |
| `reasoning_effort` | `"high"` | Reasoning effort level (when thinking is enabled) |
| `system_prompt` | *(custom)* | System prompt guiding model behaviour |

Sub-agents use a separate `HYPERPARAMETERS` block in `lib/subAgentLoop.js` with reasoning disabled by default (`thinking: { type: "disabled" }`).

## Code Overview

### `main.js` (7 lines) — Entry Point

- Imports `runChat` from `lib/orchestrator.js` and invokes it with `await`.
- No other logic — pure entry dispatch.

### `lib/orchestrator.js` (~319 lines) — Application Orchestration

- Sets up OpenAI client and loads `HYPERPARAMETERS`.
- `runChat()` — top-level entry: calls model selection + thinking toggle, then starts the loop.
- `multiTurnLoop()` — conversation orchestrator with sliding context window, inner tool-execution loop, and per-iteration telemetry.
- `callModel()` — thin wrapper over `OpenAI.chat.completions.create()`.
- Uses `MANAGER_TOOLS` from `tools/registry.js`.

### `lib/tokenizer.js` (~161 lines) — Token Estimation

- Initialises `tiktoken` encoder with heuristic fallback.
- `estimateTokens(messages, reasoning_history, token_multiplier)` — iterates messages, sums input/output tokens accounting for tool calls, reasoning history, and structural overhead.

### `lib/cliInput.js` (~58 lines) — User I/O

- `ask(question)` — wraps `readline.question()` in a Promise.
- `startChat()` — model selection menu (1. flash, 2. pro).
- `thinkingToggle()` — reasoning content enable/disable menu.

### `lib/streamHandler.js` (~62 lines) — Streaming Response Parser

- `printStreamResponse(stream, extra_body)` — async generator consumer that returns `{ reasoning_content, content, tool_calls }`.
- Handles thinking content, standard content, and incremental tool-call assembly from chunks.

### `lib/subAgentLoop.js` (~187 lines) — Sub-Agent Model Loop

- Mirrors the main orchestrator loop but uses `SUBAGENT_TOOLS` (9 tools, all consent-free).
- Reasoning is disabled by default — sub-agents are autonomous workers.
- Reads the delegated task prompt and runs until the task is complete.

### `lib/subAgentTerminal.js` (~120 lines) — Independent Terminal Manager

- `createSubAgentTerminal(subAgentName)` — spawns a new PowerShell window that tails a temp log file.
- Returns a logger object with `write()` and `close()` methods.
- All sub-agent output appears in the dedicated window, isolated from the main terminal.

### `tools/registry.js` (~87 lines) — Central Tool Map

- Imports all 10 tool schemas and handlers.
- Exports three registries: `WORKER_TOOLS`, `SUBAGENT_TOOLS`, `MANAGER_TOOLS`.
- Exports `callToolsInBatch` for batch execution.

### `tools/template.js` (~69 lines) — DRY Boilerplate Factory

- `createToolHandler(name, handlerFn, needsConsent)` — wraps any pure handler with:
  1. Console alert (tool name + truncated args)
  2. Optional user consent prompt (`y/n`)
  3. `try/catch` with formatted error return

### `tools/callToolsInBatch.js` (~183 lines) — Batch Execution Engine

- Runs multiple tool calls from a single model response.
- Consent-required tools execute sequentially (via a lock); read-only tools execute concurrently via `Promise.all`.
- Phase 1: batch summary display — prints all tool calls with consent tags.
- Phase 2: unified execution — serialises consent tools, parallelises read-only tools.

## Agent Guidelines

See [`docs/agents.md`](docs/agents.md) for detailed agent conventions, including:
- Path conventions (all paths relative to the project root)
- Tool consent model
- File encoding rules (always UTF-8)
- PowerShell quick reference

See [`docs/agents.md`](docs/agents.md) and [`docs/tool-categories.md`](docs/tool-categories.md) for further documentation.