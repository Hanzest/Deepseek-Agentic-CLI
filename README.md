# Deepseek Agentic CLI

**Your AI pair-programmer in the terminal.** Describe what you want — the CLI reads your codebase, plans changes, writes code, runs commands, spawns sub-agents for complex tasks, and saves every session. All powered by DeepSeek models.

---

## Quick Install

### Prerequisites

- **Node.js 18+** (or **Docker** — see below)
- A **DeepSeek** (or OpenAI-compatible) API key and base URL

### Option A — Direct (Node)

```powershell
git clone <repo-url>
cd Deepseek-Agentic-CLI
```

Create a `.env` file (git-ignored):

```env
DEEPSEEK_API_KEY=your_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
```

Install and run:

```powershell
npm install
node main.js
```

### Option B — Docker

```powershell
docker-compose up --build
```

The Docker setup mounts your `.env` as a Docker secret. No Node.js installation required.

### Verify It Works

```powershell
npm test              # Full test suite
npm run test:unit     # Unit tests only (offline)
```

---

## Features

- **Multi-turn conversation** — persistent chat history with automatic context window management (`/save`, auto-save).
- **Streaming output** — real-time token-by-token display of model responses, including reasoning/thinking blocks.
- **Reasoning/Thinking content** — optional display of the model's chain-of-thought (DeepSeek `thinking.type`).
- **Tool-use agent loop** — the model can autonomously invoke tools in parallel, receive results, and continue the conversation.
- **Role-based sub-agent delegation** — delegate tasks to specialised sub-agents (e.g. `execution`) with isolated context, independent terminal windows, and role-specific tool sets.
- **Agent / Plan mode** — toggle between unrestricted Agent mode and restricted Plan mode (file mutations blocked outside `artifacts/active/`). Iteration guard prevents unbounded tool loops.
- **Token estimation & cost tracking** — real-time input/output token counts via `tiktoken` (with heuristic fallback), accumulated cost estimates, and per-turn audit trail (`/audit`).
- **Sliding context window** — when approaching the token limit, older messages are pruned while preserving conversation integrity.
- **Session commands** — `/help`, `/plan`, `/agent`, `/save`, `/clear`, `/status`, `/verbose`, `/audit`, `/exit`.
- **Chat history persistence** — every session is saved to `chat_history/` with timestamped JSON files, sanitised filenames, and auto-save option.
- **Artifact management** — plans and deliverables are written to `artifacts/active/` and can be archived to `artifacts/history/` with timestamps.
- **Colour-coded terminal output** — clear visual distinction between reasoning, model output, tool alerts, batch summaries, errors, and system info.
- **Read-only caching** — idempotent read tools (`get_project_tree`, `read_file_chunk`, `multi_file_search_string`) are cached per-turn to avoid redundant API calls.
- **Iteration guard** — warns when the inner tool-execution loop exceeds the configured limit, preventing diagnostic spirals.
- **Session Memory** — tracks files created/modified, user preferences, and key decisions across turns.
- **Modular architecture** — single-responsibility files, DRY boilerplate via a tool handler factory, Open/Closed principle-friendly tool registry.

---

## Project Structure

```
Deepseek-Agentic-CLI/
├── .gitignore
├── .env                       # API configuration (git-ignored)
├── .dockerignore
├── Dockerfile                 # Docker image for containerised deployment
├── docker-compose.yml         # Docker Compose with secrets support
├── eslint.config.js           # ESLint flat config
├── main.js                    # Entry point (4 lines: imports runChat, invokes it)
├── helper.js                  # Barrel re-exports for backward compatibility
├── package.json               # Dependencies & scripts
├── lib/
│   ├── orchestrator.js        # Chat loop, model invocation, sliding context, mode switching (1096 lines)
│   ├── tokenizer.js           # Token estimation (tiktoken + heuristic fallback)
│   ├── cliInput.js            # User I/O (ask, askYesNo, startChat, thinkingToggle, createPromptLoop)
│   ├── streamHandler.js       # Streaming response parser (reasoning, content, tool calls)
│   ├── subAgentLoop.js        # Independent model loop for sub-agents (role-based tool sets)
│   ├── subAgentTerminal.js    # Spawn and manage dedicated PowerShell windows for sub-agents
│   ├── artifactManager.js     # Artifact lifecycle (active/ → history/ archive, plan validation)
│   ├── chatHistory.js         # Conversation persistence (timestamped JSON, sanitised filenames)
│   ├── colors.js              # Central colour definitions and colorize() helper
│   └── fileReader.js          # Shared UTF-8 file reading with \r\n → \n normalisation
├── tools/
│   ├── registry.js            # Central tool map: ALL_TOOLS, ORCHESTRATOR_TOOLS, buildSubagentTools()
│   ├── template.js            # createToolHandler() factory — DRY log + consent + try/catch wrapper
│   ├── callToolsInBatch.js    # Batch execution engine (consent tools serial, read-only concurrent, caching)
│   ├── executeTerminal.js     # Shell command execution (with Plan Mode safety checks)
│   ├── patchFile.js           # Targeted string search-and-replace / line-number replacement
│   ├── readFileChunk.js       # Read a range of lines from a file
│   ├── getProjectTree.js      # Directory tree walk respecting .gitignore
│   ├── fetchUrl.js            # Fetch URL → clean Markdown extraction (with proxy & Wayback fallback)
│   ├── askUserPreferences.js  # Multi-question preference prompts
│   ├── writeOrCreateFile.js   # Write/create files (with Plan Mode guard, line-range overwrite)
│   ├── multiFileSearchString.js  # Search for a string across multiple files with glob support
│   ├── delegateSubAgent.js    # Delegate 1..N sub-tasks to role-based sub-agents in isolated terminals
│   └── roleSystemPrompts.js   # Canonical role definitions (execution) with tool permissions
├── docs/
│   ├── README.md              # Skill document writing guidelines (for AI agents & human authors)
│   └── skills/
│       ├── docker/SKILL.md    # Docker domain knowledge
│       ├── fullstack/SKILL.md # Full-stack development domain knowledge
│       ├── githubcicd/SKILL.md# GitHub CI/CD domain knowledge
│       ├── uiux/SKILL.md      # UI/UX design domain knowledge
│       └── web-research/SKILL.md # Web research methodology
├── artifacts/
│   ├── active/                # Active plans & deliverables (git-ignored)
│   └── history/               # Archived plans & deliverables (git-ignored)
├── chat_history/              # Saved conversation JSON files (git-ignored)
└── test/
    ├── setup.js               # Vitest setup
    ├── helpers.js             # Test utilities
    ├── fixtures/              # Test fixture files
    ├── functionality/         # Functionality tests (13 test files)
    └── reliability/           # Reliability tests (14 test files)
```

---

## Usage

Run the agent from the project root:

```powershell
node main.js
```

### Startup Prompts

1. **Model selection** — choose between available models (e.g. `deepseek-v4-flash`, `deepseek-v4-pro`).
2. **Reasoning toggle** — enable or disable the display of chain-of-thought / thinking content.
3. **Auto-save prompt** — choose whether to auto-save chat history every turn.

### Session Banner

On startup, a session banner displays the active model, mode (Plan/Agent), thinking status, and token limit.

### Conversation Loop

- Type your message and press **Enter**.
- The model may respond with text, and/or invoke one or more **tools**.
- Tool results are fed back to the model, which can then respond or call additional tools.
- The model may also **delegate sub-tasks** to role-based sub-agents, which open independent terminal windows.
- Type **`exit`** to end the conversation (you'll be prompted to save).

### Session Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/plan` | Switch to Plan Mode (mutation blocked, `artifacts/active/` exempt) |
| `/agent` | Switch to Agent Mode (all tools available) |
| `/save` | Save the current session immediately |
| `/clear` | Clear the terminal screen |
| `/status` | Show session info (mode, model, tokens, messages, estimated cost) |
| `/verbose` | Toggle detailed per-iteration telemetry on/off |
| `/audit` | Show sub-agent token & cost breakdown with orchestrator totals |
| `/exit` | Quit the chat session |

### Token Display

Token estimates (input/output/total) are shown before each user prompt when context usage exceeds 15% of the configured token limit. The context window automatically slides (removing older messages) when usage exceeds 80% of the configured limit.

---

## Built-in Tools

The AI has **9 tools** at its disposal, grouped by capability. Read-only tools run autonomously; mutation/network tools require your `y/n` consent.

### 🔍 Codebase Exploration (automatic)

| Tool | What it does |
|------|-------------|
| `get_project_tree` | Walk directory tree (respects `.gitignore`) |
| `read_file_chunk` | Read a range of lines from any file |
| `multi_file_search_string` | Grep-style search across files with glob patterns |

### ✏️ Code Mutation (consent required for shell only)

| Tool | What it does | Consent |
|------|-------------|:-------:|
| `patch_file` | Targeted search-and-replace or line-number edit | ❌ No |
| `write_or_create_file` | Write new file or overwrite sections (line-range, append, create parents) | ❌ No |
| `execute_terminal_command` | Run any PowerShell command | ✅ Yes |

### 🌐 External Data (all automatic)

| Tool | What it does |
|------|-------------|
| `fetch_url` | Fetch URL, extract clean Markdown (proxy & Wayback fallback) |
| `ask_user_preferences` | Ask you multi-choice questions to resolve ambiguity |

### 🤖 Orchestration (automatic)

| Tool | What it does |
|------|-------------|
| `delegate_sub_agents` | Spawn 1..N isolated sub-agents in separate terminals, each with role-scoped tools |

> `search_web` is temporarily disabled pending DuckDuckGo rate-limit resolution.

### Tool Registries

| Registry | Contents | Used By |
|----------|----------|---------|
| `ALL_TOOLS` | All 9 tools as `[schema, handler]` pairs (no consent flags) | Master catalog |
| `ORCHESTRATOR_TOOLS` | 9 tools with consent flags | Main orchestrator |
| `buildSubagentTools(role)` | Dynamically built from role definitions in `roleSystemPrompts.js`; all consent flags `false` | Sub-agents (autonomous) |

### Read-Only Caching

Three exploration tools (`get_project_tree`, `read_file_chunk`, `multi_file_search_string`) are cached per-turn. Identical calls within the same turn return cached results — no redundant I/O.

---

## Agent / Plan Mode

The system operates in two modes:

| Mode | Description | Mutation Blocked |
|------|-------------|:----------------:|
| **Agent Mode** | All tools available, unrestricted file mutations | ❌ No |
| **Plan Mode** | File mutations (`patch_file`, `write_or_create_file`, `execute_terminal_command`) are blocked **unless** the target path is inside `artifacts/active/`. Git status/diff and commands redirecting to `artifacts/` are allowed. | ✅ Yes (except `artifacts/active/`) |

Switch modes at any time with `/plan` or `/agent`.

---

## Sub-Agent Delegation System

When the model encounters a complex multi-step task, it can use `delegate_sub_agents` to:

1. Generate a structured Markdown prompt file with the sub-agent's goal, purpose, deliverables, and context.
2. Look up the role definition (e.g., `execution`) from `roleSystemPrompts.js`.
3. Spawn an **independent PowerShell terminal window** via `subAgentTerminal.js`.
4. Run a **separate model loop** (`subAgentLoop.js`) in that window with its own context, using only the tools allowed by the role.
5. The sub-agent operates autonomously, writing results back to the project files.
6. The main agent continues its own conversation in the original terminal, checking the sub-agent's output when done.

### Role Definitions

Roles are defined in `tools/roleSystemPrompts.js`:

| Role | Description | Tools Allowed |
|------|-------------|---------------|
| `execution` | Implement code changes, create/modify files, execute terminal commands | `execute_terminal_command`, `patch_file`, `read_file_chunk`, `get_project_tree`, `fetch_url`, `ask_user_preferences`, `write_or_create_file`, `multi_file_search_string` |

This provides **true context isolation** — the sub-agent's token budget, message history, and reasoning do not consume the main agent's context window.

---

## Chat History

- Every session is saved to `chat_history/{DD.MM.YYYY}/{HH.MM.SS} - {model} - {title}.json`.
- Filenames are sanitised (Windows-safe, max 50 chars).
- The LLM generates a chat title from the first user message (fallback: truncated user input).
- Auto-save can be enabled at startup or toggled per-session.
- Use `/save` to trigger a manual save at any time.

---

## Artifact Management

- Plans and deliverables are written to `artifacts/active/`.
- On task completion, `archiveActiveToHistory(taskName)` moves all files to `artifacts/history/{taskName}/{YYYY-MM-DD_HH.MM.SS}/`.
- Plan files (starting with `PLAN-`) are validated for structural integrity before archiving.

---

## Iteration Guard

When the inner tool-execution loop exceeds `iteration_limit` (default: 30), the iteration guard prompts:

- **(Y)** Continue with extended budget (+25 iterations)
- **(N)** Abort the current task
- **(P)** Switch to Plan Mode and continue

This prevents unbounded diagnostic spirals and excessive token consumption.

---

## Session Memory

The orchestrator maintains a session memory object that tracks across turns:

- **Files Created** — tracked from `write_or_create_file` calls
- **Files Modified** — tracked from `patch_file` calls
- **User Preferences** — captured from `ask_user_preferences` calls
- **Key Decisions** — inferred from tool interactions

This memory is injected into the system prompt at the start of each turn for continuity.

---

## Configuration

Hyperparameters are defined in `lib/orchestrator.js` under the `HYPERPARAMETERS` object:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `token_limit` | 200000 | Maximum tokens per request |
| `token_multiplier` | 1.5 | Fallback multiplier for heuristic token estimation |
| `stream` | `true` | Enable streaming responses |
| `reasoning_effort` | `"high"` | Reasoning effort level (when thinking is enabled) |
| `iteration_limit` | 30 | Max iterations before iteration guard triggers |
| `iteration_continue_budget` | 25 | Additional iterations granted on "Continue" |
| `system_prompt` | *(custom)* | Full agent system prompt with planning pipeline |

### Pricing (per 1M tokens, USD)

| Model | Input | Output | Cache Miss |
|-------|-------|--------|------------|
| `deepseek-v4-flash` | $0.0028 | $0.28 | $0.14 |
| `deepseek-v4-pro` | $0.003625 | $0.87 | $0.435 |

### Sub-Agent Configuration (`lib/subAgentLoop.js`)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `token_limit` | 65535 | Maximum tokens per sub-agent request |
| `token_multiplier` | 1.5 | Fallback multiplier for heuristic token estimation |
| `stream` | `true` | Enable streaming responses |
| `max_iterations` | 20 | Default max iterations (overridable via prompt banner) |
| `max_output_tokens` | 8192 | Max output tokens per sub-agent response |
| Reasoning | Disabled | Sub-agents are autonomous workers |

---

## Code Overview

### `main.js` (4 lines) — Entry Point

- Imports `runChat` from `lib/orchestrator.js` and invokes it with an IIAFE.
- No other logic — pure entry dispatch.

### `lib/orchestrator.js` (~1096 lines) — Application Orchestration

- Sets up OpenAI client and loads `HYPERPARAMETERS`.
- `runChat()` — top-level entry: model selection + thinking toggle + auto-save prompt.
- `multiTurnLoop()` — conversation orchestrator with sliding context, inner tool-execution loop, iteration guard, mode switching, and per-iteration telemetry.
- `callModel()` — thin wrapper over `OpenAI.chat.completions.create()` with DeepSeek/Gemini compatibility.
- `SessionContext` — mutable session state object (mode, tokens, audit trail, session memory).
- Slash command handler (`/help`, `/plan`, `/agent`, `/save`, `/clear`, `/status`, `/verbose`, `/audit`).
- Iteration guard, chat title generation, session memory management.

### `lib/tokenizer.js` (~143 lines) — Token Estimation

- Initialises `tiktoken` encoder (`cl100k_base`) with heuristic fallback.
- `estimateTokens(messages, reasoning_history, token_multiplier)` — iterates messages, sums input/output tokens accounting for tool calls, reasoning history, and structural overhead.

### `lib/cliInput.js` (~267 lines) — User I/O

- `ask(question)` — wraps `readline.question()` in a Promise with stdin mutex for Windows console mode safety.
- `askYesNo(question, defaultYes)` — boolean prompt with defaults.
- `startChat()` — model selection menu.
- `thinkingToggle()` — reasoning content enable/disable menu.
- `createPromptLoop()` — persistent prompt loop with input history (arrow-up recall).

### `lib/streamHandler.js` (~71 lines) — Streaming Response Parser

- `printStreamResponse(stream, extra_body, role)` — async generator consumer that returns `{ reasoning_content, content, tool_calls, usage }`.
- Handles thinking content (coloured), standard content, and incremental tool-call assembly from chunks.
- Captures actual API usage from the final stream chunk.

### `lib/subAgentLoop.js` (~252 lines) — Sub-Agent Model Loop

- Mirrors the main orchestrator loop but uses `buildSubagentTools(role)` for role-specific tool sets.
- Reasoning is disabled by default — sub-agents are autonomous workers.
- Reads the delegated task prompt, runs until complete, reports final summary.

### `lib/subAgentTerminal.js` (~116 lines) — Independent Terminal Manager

- `createSubAgentTerminal(subAgentName)` — spawns a new PowerShell window that tails a temp log file.
- Returns a logger object with `write()` and `close()` methods.
- All sub-agent output appears in the dedicated window, isolated from the main terminal.

### `lib/artifactManager.js` (~208 lines) — Artifact Lifecycle

- `ensureActiveDir()` — creates `artifacts/active/` if missing.
- `archiveActiveToHistory(taskName)` — moves files from `active/` to `history/{taskName}/{timestamp}/`.
- `isPlanFile(filename)` — identifies plan files by `PLAN-` prefix.
- `validatePlanContent(content)` — validates plan structure.

### `lib/chatHistory.js` (~122 lines) — Conversation Persistence

- `sanitizeFilename(raw, maxLen)` — Windows-safe filename sanitisation.
- `saveChatHistory(messages, modelName, title)` — saves conversation to timestamped JSON.
- `saveAuditHistory(auditData)` — saves audit trail data.

### `lib/colors.js` (~30 lines) — Terminal Colours

- Central `C` object with semantic colour codes (user, model, system, warning, error, success, tool, border, heading).
- `colorize(text, color)` — apply colour with reset.

### `lib/fileReader.js` (~27 lines) — Shared File Reading

- `readFileUtf8Normalized(filePath)` — reads UTF-8 file with `\r\n` → `\n` normalisation for cross-platform consistency.

### `tools/registry.js` (~122 lines) — Central Tool Map

- Imports all 9 tool schemas and handlers.
- Exports `ALL_TOOLS`, `ORCHESTRATOR_TOOLS`, `buildSubagentTools(role)`.
- Exports `callToolsInBatch` for batch execution.

### `tools/template.js` (~64 lines) — DRY Boilerplate Factory

- `createToolHandler(name, handlerFn, needsConsent)` — wraps any pure handler with:
  1. Console alert (tool name + truncated args)
  2. Optional user consent prompt (`y/n`)
  3. `try/catch` with formatted error return

### `tools/callToolsInBatch.js` (~358 lines) — Batch Execution Engine

- Runs multiple tool calls from a single model response.
- **Phase 1:** Batch summary display — prints all tool calls with consent tags.
- **Phase 2:** Unified execution — consent tools serialised via lock; read-only tools concurrent via `Promise.all`.
- **Phase 3:** Progress indicators with per-tool timing.
- Read-only caching for idempotent tools.
- Plan Mode mutation blocking with safe-command allowlist (`git status/diff`, `artifacts/` redirects).

### `tools/roleSystemPrompts.js` (~75 lines) — Role Definitions

- Defines the `execution` role with description, output constraints, and allowed tools.
- `getRoleEntry(role)` — lookup function for role resolution.
- `VALID_ROLES` — convenience array for validation.

---

## Security

- **Plan Mode** blocks dangerous mutations (`patch_file`, `write_or_create_file`, `execute_terminal_command`) unless targeting `artifacts/active/`.
- **Safe command allowlist** in Plan Mode: `git status`, `git diff`, commands redirecting to `artifacts/`.
- Dangerous command patterns (e.g. `Get-Content *`) are blocked before execution.
- All destructive/network operations in the orchestrator prompt the user for approval before proceeding.
- Sub-agents operate autonomously in independent terminal windows; all their tool calls are logged to stdout via `callToolsInBatch`.
- File paths in `writeOrCreateFile.js` are sanitised to prevent path traversal.
- Plan content is validated for structural integrity before archiving.

---

## Testing

The project uses **Vitest** as the test runner with two test suites:

```powershell
npm run test:functionality   # Functionality tests (13 test files)
npm run test:reliability     # Reliability tests (14 test files)
npm run test:unit            # Unit tests only (excludes @network tests)
npm run test:network         # Network-dependent tests only
```

Test files cover: `askUserPreferences`, `callToolsInBatch`, `delegateSubAgent`, `executeTerminal`, `fetchUrl`, `getProjectTree`, `multiFileSearchString`, `patchFile`, `readFileChunk`, `registry`, `searchWeb`, `template`, `writeOrCreateFile`.

---

## Docker Support

The project includes a `Dockerfile` (Node 22 Alpine) and `docker-compose.yml` for containerised deployment:

```powershell
docker-compose up --build
```

- Uses Docker secrets for `.env` injection at runtime.
- Runs as non-root `node` user.
- Exposes port 3000.

---

## Domain Knowledge (docs/skills/)

The `docs/skills/` directory contains SKILL.md files encoding industry-standard principles, constraints, and anti-patterns for specific domains. When a user request falls into a covered domain, the orchestrator reads the relevant SKILL.md to inform planning and implementation decisions.

Available skill domains:
- **Docker** — containerisation best practices
- **Full-stack** — full-stack development standards
- **GitHub CI/CD** — continuous integration & deployment
- **UI/UX** — user interface & experience design
- **Web Research** — web research methodology & tooling

See `docs/README.md` for SKILL.md authoring guidelines.
