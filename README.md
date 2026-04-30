# DeepSeek Chatbot — Multi-Turn CLI with Tool-Use

A multi-turn conversational chatbot powered by **DeepSeek models** via an OpenAI-compatible API.  
The chatbot runs in the terminal and supports **streaming responses**, **reasoning/thinking content**, **sliding context windows**, and **6 built-in tool-use capabilities** that the model can invoke autonomously (with user consent).

## Features

- **Multi-turn conversation** — persistent chat history with automatic context window management.
- **Streaming output** — real-time token-by-token display of model responses.
- **Reasoning content** — optional display of the model's chain-of-thought / thinking blocks.
- **Tool-use agent loop** — the model can autonomously call tools, receive results, and continue the conversation.
- **Token estimation** — real-time input/output token counts powered by `tiktoken` (with heuristic fallback).
- **Sliding context window** — when approaching the token limit, older messages are pruned while preserving conversation integrity.
- **Colour-coded terminal output** — clear visual distinction between reasoning, model output, tool alerts, and errors.

## Project Structure

```
Deepseek_Chatbot/
├── .gitignore
├── README.md
├── .env                   # API configuration (git-ignored)
├── mainAPI.py             # Entry point — chat loop, streaming, tool orchestration
├── helper.py              # CLI prompts, model selection, token estimation
├── modelTool.py           # 6 tool definitions and their implementations
└── docs/
    └── agents.md          # Agent guidelines (tool conventions, path rules, etc.)
```

## Requirements

- Python 3.10+
- A DeepSeek (or compatible) API key and base URL

### Python Dependencies

Install with:

```powershell
pip install openai python-dotenv tiktoken pathspec duckduckgo-search requests beautifulsoup4 markdownify
```

| Package | Purpose |
|---|---|
| `openai` | OpenAI-compatible API client for DeepSeek models |
| `python-dotenv` | Load `.env` file |
| `tiktoken` | Accurate token counting |
| `pathspec` | `.gitignore`-aware directory tree traversal |
| `duckduckgo-search` | Web search via DuckDuckGo |
| `requests` | HTTP client for URL fetching |
| `beautifulsoup4` | HTML parsing for URL content extraction |
| `markdownify` | HTML-to-Markdown conversion |

## Setup

1. **Clone the repository** and navigate to the project root directory.

2. **Create a `.env` file** in the project root with the following:

   ```env
   MODEL_API_KEY=your_api_key_here
   MODEL_BASE_URL=https://api.deepseek.com/v1
   ```

   > The `.env` file is git-ignored and must never be committed.

3. **Install Python dependencies** (see above).

## Usage

Run the chatbot from any directory:

```powershell
python mainAPI.py
```

### Startup Prompts

1. **Model selection** — choose between available DeepSeek models (e.g. `deepseek-v4-flash`, `deepseek-v4-pro`).
2. **Reasoning toggle** — enable or disable the display of chain-of-thought / thinking content.

### Conversation Loop

- Type your message and press **Enter**.
- The model may respond with text, and/or invoke one or more **tools** (with your approval).
- Tool results are fed back to the model, which can then respond or call additional tools.
- Type **`exit`** to end the conversation.

The token estimates (input/output/total) are displayed before each user prompt, and the context window automatically slides (removing older messages) when usage exceeds 80% of the configured token limit.

## Built-in Tools

The model has access to the following tools. Tools that modify the system or make network requests require explicit **user consent** (`y/n` prompt) before execution.

| Tool | Description | Consent Required |
|---|---|---|
| `execute_terminal_command` | Execute any PowerShell command on the user's machine | ✅ Yes |
| `patch_file` | Perform a targeted string search-and-replace in a file | ✅ Yes |
| `read_file_chunk` | Read a range of lines from a file (with line numbers) | ❌ No |
| `get_project_tree` | Walk the project directory tree, respecting `.gitignore` | ❌ No |
| `search_web` | Search the web via DuckDuckGo | ❌ No |
| `fetch_url` | Fetch a URL and extract clean Markdown content | ✅ Yes |

### Security

- The `.env` file is **protected** at the tool level — read, write, and execution tools all refuse to touch `.env` files.
- Dangerous command patterns (e.g. `Get-Content *`) are blocked before execution.
- All destructive/network operations prompt the user for approval before proceeding.

## Configuration

Hyperparameters are defined in `mainAPI.py` under the `HYPERPARAMETERS` dictionary:

| Parameter | Default | Description |
|---|---|---|
| `token_limit` | 32768 | Maximum tokens per request |
| `token_multiplier` | 1.5 | Fallback multiplier for heuristic token estimation |
| `stream` | `True` | Enable streaming responses |
| `reasoning_effort` | `"high"` | Reasoning effort level (when thinking is enabled) |
| `system_prompt` | *(custom)* | System prompt guiding model behaviour |

## Code Overview

### `mainAPI.py` — Entry Point & Chat Loop

- Sets up the OpenAI client from `.env`.
- Registers all 6 tools in `TOOL_REGISTRY`.
- `multiTurnLoop()` — the main conversation loop with sliding context window and tool execution.
- `printStreamResponse()` — handles streaming output for reasoning content, standard content, and tool calls.
- `callModel()` — thin wrapper around the OpenAI chat completions API.

### `helper.py` — Utilities

- `startChat()` — model selection CLI prompt.
- `thinkingToggle()` — reasoning content enable/disable prompt.
- `estimateTokens()` — estimates input/output tokens for a message list, accounting for tool calls, reasoning history, and multimodal content.

### `modelTool.py` — Tool Implementations

Each tool is defined as a pair:
1. A **JSON schema** dict (compatible with OpenAI/DeepSeek `tools` parameter).
2. A **Python handler function** that performs the action and returns a string result.

## Agent Guidelines

See [`docs/agents.md`](docs/agents.md) for detailed agent conventions, including:
- Path conventions (all paths relative to the project root)
- Tool consent model
- File encoding rules (always UTF-8)
- PowerShell quick reference
- `.pyc` cache troubleshooting
