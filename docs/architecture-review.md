# Architecture Review — Codebase Structure Assessment

**Date:** 2026
**Scope:** `helper.js`, `main.js`, `modelTool.js`
**Principle Baseline:** DRY, SOLID (SRP/OCP), Testability, Maintainability

---

## 1. Executive Summary

The current codebase works correctly as a prototype, but the file boundaries do not reflect logical separation of concerns. All three files violate the **Single Responsibility Principle (SRP)** to varying degrees, and `modelTool.js` contains significant **copy-paste repetition** across tool implementations. The structure is suitable for a single-developer prototype but will resist scaling, testing, and team collaboration.

| Metric | Current State | Target State |
|--------|--------------|--------------|
| Files with >1 responsibility | 3 / 3 | 0 / 3 |
| Duplicated consent/error/logic patterns | 3 copies | 1 shared wrapper |
| Lines per "tool unit" | 712 (single file) | ~40-80 per file |
| Effort to add a new tool | Append 100+ lines to monolith | Create 1 file + 1-line registry entry |

---

## 2. File-by-File Analysis

### 2.1 `helper.js` (212 lines)

#### Responsibilities (violation of SRP)

1. Tokenizer initialisation (`tiktoken`)
2. Token estimation logic (`estimateTokens`, `_estimate_text_tokens`, `_estimate_tool_call_tokens`)
3. CLI input helper (`ask()`)
4. Model selection UI (`startChat()`)
5. Reasoning toggle UI (`thinkingToggle()`)

#### Problem

Items 1-2 are **pure computation** with no side effects. Items 3-5 are **I/O-bound UI interactions**. These families of code:

- Have **zero overlapping dependencies** (`tiktoken` vs `readline`)
- Will change for **different reasons** (tokenizer update vs new UI prompt)
- Cannot be tested independently without mocking `readline` alongside token math

#### Recommendation

Split into two files:

| New File | Contents | Purity |
|----------|----------|--------|
| `lib/tokenizer.js` | `ENCODER`, `estimateTokens()`, `_estimate_text_tokens()`, `_estimate_tool_call_tokens()` | Pure (no I/O) |
| `lib/cliInput.js` | `ask()`, `startChat()`, `thinkingToggle()` | I/O-bound |

---

### 2.2 `modelTool.js` (712 lines)

#### Responsibilities (violation of SRP + DRY)

1. 6 tool JSON schemas (data definitions)
2. 6 tool handler implementations (business logic)
3. 3 consent dialogs (I/O)
4. Repetitive error-handling blocks (identical try/catch in `execute_terminal_command`, `patch_file`, `get_project_tree`, `read_file_chunk`, `fetch_url`)
5. Internal helper `_load_gitignore_spec` (buried inside file, not exported)

#### Problem

Every tool repeats the same structural pattern:

```js
// Pattern repeated 6 times with minor variations
export async function someTool({ params }) {
    // 1. Security check (some tools)
    // 2. Console log alert
    // 3. Maybe ask for consent (3 tools)
    // 4. try { core logic } catch { error handling }
    // 5. Return result string
}
```

This is a **copy-paste architecture**. Adding a 7th tool means copying ~80-100 lines, changing ~10 lines of actual logic, and keeping the boilerplate.

#### Recommendation

Extract a reusable `createToolHandler()` wrapper that eliminates the boilerplate, then split each tool into its own file:

| New File | Contents |
|----------|----------|
| `tools/template.js` | `createToolHandler(name, handlerFn, needsConsent)` |
| `tools/registry.js` | `TOOL_REGISTRY` map of name -> `{schema, handler}` |
| `tools/executeTerminal.js` | Schema + pure logic for terminal execution |
| `tools/patchFile.js` | Schema + pure logic for file patching |
| `tools/readFileChunk.js` | Schema + pure logic for chunked reading |
| `tools/getProjectTree.js` | Schema + pure logic (incl. `_load_gitignore_spec`) |
| `tools/searchWeb.js` | Schema + pure logic for web search |
| `tools/fetchUrl.js` | Schema + pure logic for URL fetching |

The `template.js` wrapper condenses the repeated pattern:

```js
// tools/template.js
export function createToolHandler(name, handler, needsConsent = false) {
    return async (args) => {
        logAlert(name, args);
        if (needsConsent) {
            const ok = await ask("Approve? (y/n): ");
            if (ok !== "y") return "User denied.";
        }
        try {
            return await handler(args);
        } catch (e) {
            return formatError(name, e);
        }
    };
}
```

---

### 2.3 `main.js` (299 lines)

#### Responsibilities

1. API client setup (`OpenAI`)
2. Hyperparameter configuration
3. `TOOL_REGISTRY` assembly (imports from `modelTool.js`)
4. `printStreamResponse()` - streaming parser
5. `callModel()` - API invocation wrapper
6. `multiTurnLoop()` - conversation orchestrator
7. Entry-point dispatch

#### Problem

This is the **best-structured file** of the three, but it still conflates two concerns:

- **Streaming logic** (`printStreamResponse`) is tightly coupled to the conversation loop, making it unusable if you later want a non-streaming mode, a webhook endpoint, or a batch processor.

#### Recommendation

Extract streaming into its own module:

| New File | Contents |
|----------|----------|
| `lib/streamHandler.js` | `printStreamResponse(stream)` - pure transformation: stream -> `{reasoning_content, content, tool_calls}` |
| `lib/orchestrator.js` | `multiTurnLoop()` + `callModel()` - conversation and API logic |
| `main.js` | Stays as thin entry point (~10 lines) |

---

## 3. Proposed Directory Structure

```
Deepseek_Chatbot/
|-- main.js                  Entry point (thin: parse args, start orchestrator)
|-- lib/
|   |-- tokenizer.js         estimateTokens() + helpers (pure)
|   |-- cliInput.js          ask(), startChat(), thinkingToggle() (I/O)
|   |-- streamHandler.js     printStreamResponse() (stream to data)
|   |-- orchestrator.js      multiTurnLoop(), callModel()
|-- tools/
|   |-- registry.js          TOOL_REGISTRY (central map)
|   |-- template.js          createToolHandler() (DRY wrapper)
|   |-- executeTerminal.js   Tool: schema + handler
|   |-- patchFile.js         Tool: schema + handler
|   |-- readFileChunk.js     Tool: schema + handler
|   |-- getProjectTree.js    Tool: schema + handler
|   |-- searchWeb.js         Tool: schema + handler
|   |-- fetchUrl.js          Tool: schema + handler
|-- docs/
|   |-- agents.md
|   |-- architecture-review.md (this file)
|   |-- plan.md
|-- package.json
```

**Lines per file after refactor (estimated):**

| File | Lines (est.) | Responsibility |
|------|-------------|----------------|
| `main.js` | ~10 | Entry dispatch |
| `lib/orchestrator.js` | ~160 | Orchestration (loop + API calls) |
| `lib/tokenizer.js` | ~100 | Pure token estimation |
| `lib/cliInput.js` | ~40 | I/O prompts |
| `lib/streamHandler.js` | ~60 | Stream parsing |
| `tools/template.js` | ~30 | DRY wrapper |
| `tools/registry.js` | ~20 | Central tool map |
| `tools/executeTerminal.js` | ~70 | One tool |
| `tools/patchFile.js` | ~60 | One tool |
| `tools/readFileChunk.js` | ~60 | One tool |
| `tools/getProjectTree.js` | ~120 | One tool (self-contained) |
| `tools/searchWeb.js` | ~60 | One tool |
| `tools/fetchUrl.js` | ~80 | One tool |
| **Total** | **~910** | (was 1,223 in 3 files) |

The slight reduction in total lines is from eliminating boilerplate via `createToolHandler()`. The real win is **7 single-responsibility modules** instead of 3 multi-responsibility files.

---

## 4. Open/Closed Principle (OCP) Impact

The current `modelTool.js` requires **modification** (appending to the file) to add a new tool - violating the Open/Closed Principle.

After refactor, adding a new tool follows a strict **add, don't modify** workflow:

1. **Add** `tools/newTool.js` - schema + handler (import `createToolHandler` from `template.js`)
2. **Add** one line to `tools/registry.js` - `new_tool: [new_tool_schema, newToolHandler]`
3. **Add** one import line in `tools/registry.js`

Zero modification of existing tool logic. Zero risk of breaking existing tools.

---

## 5. Testability Comparison

| Scenario | Current | After Refactor |
|----------|---------|----------------|
| Unit-test token estimation | Must import `helper.js` (mocks `readline` needed) | Import pure `lib/tokenizer.js` (no mock) |
| Unit-test a tool handler | Must import `modelTool.js` (mocks `ask()` needed) | Import isolated `tools/patchFile.js` handler function |
| Integration-test orchestration | Embedded in `main.js` | Call `lib/orchestrator.js` directly |
| Test `get_project_tree` logic | Coupled to `console.log` | Separate pure filesystem walk from I/O |

---

## 6. Migration Path (Low Risk)

The refactor can be done incrementally without breaking the application at any intermediate step:

```
Step 1:  Create lib/tokenizer.js        extract from helper.js (no imports change yet)
Step 2:  Create lib/cliInput.js         extract from helper.js
Step 3:  Create tools/template.js       new file (no extraction)
Step 4:  Create tools/executeTerminal.js copy from modelTool.js, wrap with template
Step 5:  Create tools/patchFile.js      copy from modelTool.js, wrap with template
... (repeat for each tool)
Step 6:  Create tools/registry.js       central import point
Step 7:  Create lib/streamHandler.js    extract from main.js
Step 8:  Create lib/orchestrator.js     extract from main.js
Step 9:  Rewrite main.js   thin entry point (10 lines)
Step 10: Delete modelTool.js, old helper.js sections
```

Each step is a commit. The app is runnable after every step because imports are updated atomically.

---

## 7. Decision Matrix

| Criterion | Refactor Now | Refactor Later | Never Refactor |
|-----------|-------------|----------------|----------------|
| Adding >=3 more tools | Yes | No | No |
| Adding unit tests | Yes | No | No |
| Switching from CLI to HTTP API | Yes | Yes | No |
| Portfolio / interview showcase | Yes | No | No |
| One-off personal script | No | Yes | Yes |

---

*End of architecture review.*
