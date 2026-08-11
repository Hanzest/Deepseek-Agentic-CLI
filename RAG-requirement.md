# RAG SYSTEM REQUIREMENTS SPECIFICATION — DEEPSEEK-AGENTIC-CLI

## Purpose

Build a local, offline RAG (Retrieval-Augmented Generation) system integrated into the Deepseek-Agentic-CLI.
Its primary goal is to **narrow context scope** before sending data to DeepSeek models — locating and filtering only the relevant knowledge chunks to minimize input tokens (the most expensive part of API/DPS calls) instead of feeding raw full files.

---

## 1. Functional Requirements

### 1.1 Watched Folders & Auto-Ingestion

> **Design principle:** The user never manually ingests files. Instead, two designated root folders are continuously watched. The agent auto-indexes any new or changed files and decides at retrieval time which files are relevant to the current task.

**Two-folder structure:**

| Folder | Purpose | Example contents |
|---|---|---|
| `knowledge/` | **Permanent knowledge** (long-term use). Rarely changes. | Textbooks, reference docs, research papers, style guides, codebases |
| `workspace/` | **Active working directory** (task-related). Changes frequently. | Homework, drafts, current project files, notes-in-progress |

- Both folders support arbitrary sub-folder hierarchies organized by the user (e.g., `knowledge/math/`, `workspace/essay-draft/`).
- The agent watches both folders for file changes (create, modify, delete) and **automatically re-indexes** affected files in the background — no `rag ingest` command needed.
- The agent determines which files within these folders are relevant to each task at retrieval time, based on task intent and metadata filtering.

**Included file types (MUST index):**
- Text & business documents: `.md`, `.pdf`, `.txt`, `.docx`
- Project source code: `.py`, `.ts`, `.js`, `.go`, `.cpp`
- Structured data & config: `.json`, `.yaml`, `.log`

**Excluded file types (MUST NOT index):**
- Security-sensitive files: `.env`, `.env.local`, any file containing API keys or passwords
- Temporary agent data: old chat history, session logs
- System directories: `node_modules/`, `.git/`, `__pycache__/`, `dist/`, `build/`
- Custom exclusions: support a `.ragignore` file (similar to `.gitignore`) placed inside either root folder for user-defined exclusions

---

### 1.2 Data Preprocessing & Chunking

**For prose/documents:**
- **Structure-aware chunking:** Split on natural boundaries (paragraphs, Markdown headings H1–H3). Never split by fixed character count.
- **Semantic chunking:** When heading boundaries are absent, use embedding similarity between sentences to detect topic shifts and create semantically coherent chunks.
- **Contextual overlap:** Maintain a small overlap window between adjacent chunks to preserve logical continuity across boundaries.

**For source code:**
- **AST-based chunking:** Use `tree-sitter` to parse source files into their Abstract Syntax Tree. Chunk at function, class, and module boundaries to preserve scope, import dependencies, and call hierarchies. Standard paragraph chunking MUST NOT be used for code files.

**For all content:**
- **Outline-driven indexing:** Build a hierarchical index following the document outline structure (H1–H6 for docs, module > class > function for code) to enable precise navigation inside long documents.
- **Metadata per chunk:** Attach the following to every chunk:
  - `file_path` — full path to source file
  - `line_numbers` — start and end line
  - `timestamp` — last modified time
  - `section_headers` — heading hierarchy (or code scope path) at chunk location
  - `language` — programming language (for code chunks)
  - `tags` — any relevant tags extracted

---

### 1.3 Knowledge Organization

- **Two primary layers (mapped to watched folders):**
  - **Knowledge Layer** (`knowledge/` folder) — permanent, long-term reference material: textbooks, research papers, style guides, reference codebases. Indexed once and rarely re-indexed.
  - **Workspace Layer** (`workspace/` folder) — active, task-related files: drafts, homework, current project code, notes-in-progress. Re-indexed frequently as files change.
- **Sub-namespaces:** Within each layer, sub-folders automatically become searchable namespaces (e.g., `knowledge/math/`, `workspace/essay-draft/`). The agent can scope retrieval to a specific sub-namespace when the task context makes it clear.
- **Layer isolation:** The two layers are indexed and retrievable independently. The agent decides per-task whether to search one layer, the other, or both — but results always indicate which layer each chunk came from to avoid context contamination.

---

### 1.4 Hybrid Search & Retrieval

- **Hybrid search:** Combine Dense Retrieval (vector/semantic similarity) with Sparse Retrieval (BM25 keyword matching) in every query.
- **Metadata filtering:** Apply namespace, file type, directory path, or date filters **before** running vector search to pre-narrow the candidate set.
- **Cross-encoder re-ranking (optional, bounded):** Re-rank the Top-N candidates (N ≤ 10) using a cross-encoder model accelerated via ONNX Runtime. This step is optional and should be skippable when latency is critical.
- **Query expansion:** Automatically decompose complex queries or rewrite them to improve recall before executing the search.

---

### 1.5 Agentic Reflection & Feedback Loop

- **Similarity score in results:** Every returned chunk MUST include its cosine similarity score alongside the content.
- **Confidence threshold:** Define a minimum similarity threshold (default: `0.60`). If the highest-scoring result falls below this threshold, the system triggers the query rewriting loop instead of returning low-confidence results.
- **Automated query rewriting loop:** When retrieval confidence is low, the system MUST:
  1. Rewrite or decompose the original query (synonym expansion, sub-question splitting).
  2. Re-execute the search with the rewritten query.
  3. Repeat up to a configurable max iteration count (default: 2).
  4. If still below threshold after max retries, return "no relevant data found" with the best-effort results and their scores.
- **Re-ranker confidence scores:** When cross-encoder re-ranking is enabled, expose the re-ranker score per chunk so the agent can make informed decisions about result quality.

---

### 1.6 Dynamic Token Budgeting

- **`max_prompt_tokens` parameter:** The tool interface MUST accept a `max_prompt_tokens` parameter that caps the total token count of injected context.
- **Calculation:** This budget is derived from DeepSeek's remaining context window: `max_prompt_tokens = model_context_limit - current_conversation_tokens - reserved_output_tokens`.
- **Enforcement:** The system MUST truncate or drop lower-ranked chunks to stay within budget. It must never exceed the specified token limit.

---

### 1.7 Writing & Content Synthesis Support

- **Multi-document synthesis:** Collect and merge insights, figures, and arguments from multiple source documents to support building a complete piece of writing.
- **Style & voice matching:** Allow ingesting Style Guides and sample writing so the agent can replicate the author's tone and voice.
- **Quote & paraphrase handling:** Distinguish explicitly between verbatim quote requests and paraphrase/summarization requests and handle each accordingly.
- **Source attribution:** Always return the exact source location alongside every answer in the format `file.md:lines 12-25` to enable citation and manual verification.

---

### 1.8 Automatic Agent-Driven Retrieval & Integration

> **Design principle:** The RAG system is an **internal subsystem of the agent**, not a user-facing tool. The agent MUST automatically invoke RAG retrieval on every task that involves reading, answering, searching, or reasoning over the knowledge base. The user should never need to manually trigger retrieval — the agent decides when, what, and how much to retrieve.

**Automatic retrieval trigger (conditional, not unconditional):**
- On every incoming user task, the agent MUST first **classify the task intent** to decide whether RAG retrieval is needed:

| Task type | RAG invoked? | Examples |
|---|---|---|
| Local file reading/editing | **YES** | "Summarize the README", "Find the database config", "What does `auth.py` do?" |
| Internal knowledge lookup | **YES** | "What's our API rate limit policy?", "Find the deployment checklist" |
| Writing with local references | **YES** | "Draft a report using the research notes", "Rewrite section 3 of my paper" |
| Code understanding/debugging | **YES** | "Why does this function fail?", "Explain the data pipeline" |
| Web/internet search | **NO** | "Search the web for Node.js best practices", "What's the latest Python release?" |
| General conversation | **NO** | "Hello", "Thanks", "What time is it?" |
| Pure LLM reasoning | **NO** | "Explain what a hash table is", "Translate this to French" |

- When RAG **is** invoked, the agent MUST automatically:
  1. Determine which namespaces and layers are relevant to the task.
  2. Formulate one or more retrieval queries from the task context.
  3. Call the RAG retrieval pipeline (hybrid search → re-ranking → token budgeting) internally.
  4. Inject the retrieved chunks into its prompt context before generating a response.
- This process is fully transparent to the user — no manual command is needed.
- **Cost rationale:** Skipping RAG for non-local tasks avoids injecting unnecessary chunks into the prompt, directly reducing input token cost.

**Native agent protocol (MCP over stdio):**
- Expose an internal MCP (Model Context Protocol) Server layer over `stdio` so the DeepSeek agent can auto-discover and invoke RAG capabilities programmatically.
- The MCP tool schema MUST accept structured JSON parameters including at minimum: `query`, `namespace`, `layer`, `top_k`, `min_score`, and `max_prompt_tokens`.
- This enables the agent to dynamically control retrieval scope and budget on every call without user intervention.

**CLI commands (admin/maintenance only):**

| Command | Purpose |
|---|---|
| `rag status` | Show index health, chunk count, DB size, watched folder paths |
| `rag clean` | Remove stale or orphaned index entries |
| `rag reindex` | Force a full re-index of both watched folders |

> **Note:** There is no `rag ingest` or `rag search` command. Ingestion is automatic via folder watching. Search is exclusively triggered by the agent internally. The user only manages the knowledge base by adding/removing files from the `knowledge/` and `workspace/` folders.

---

## 2. Non-Functional Requirements

### 2.1 Privacy & Security

- **100% local execution:** All chunking, embedding, and vector storage operations run fully offline on the user's machine. No data is ever transmitted externally.

---

### 2.2 Performance & Cost Efficiency

- **Input token optimization:** Only the most relevant chunks are injected into the LLM prompt. The system must never feed full raw files.
- **Low-latency search:** Query-to-result time must be near-instant to avoid disrupting the CLI workflow.
- **Quantized embedding models:** Use lightweight, quantized embedding models — currently `intfloat/multilingual-e5-small` (INT8) via FastEmbed, re-ranked with FlashRank's `ms-marco-MultiBERT-L-6-v2` — executed CPU-only to minimize CPU and memory overhead. Non-quantized models on CPU are not acceptable for production use.
- **Asynchronous background indexing:** Ingestion and re-indexing run as a non-blocking background process so they do not interrupt the user's active session.

---

### 2.3 Storage & Concurrency

- **Embedded vector database:** Use LanceDB (Apache Arrow-based) or DuckDB as the primary vector store. These support concurrent read/write without file-level locking.
- **Avoid SQLite-based vector stores** (e.g., `sqlite-vec`) for production use — they cause database lock contention when the agent performs concurrent read/write operations during background indexing.
- **No separate server process:** The database must run embedded within the CLI process. No external database server is required.

---

### 2.4 Reliability & Accuracy

- **Hallucination fallback:** If no relevant chunk is found in the knowledge base, the system MUST explicitly report "no relevant data found" instead of generating an answer from the LLM's parametric memory.
- **Incremental indexing:** Use file hashing (MD5 or SHA256) to detect changes. Only re-embed files whose content has changed since the last index run.

---

### 2.5 Robustness & Fault Tolerance

- **AST Parsing Fallback:** If AST parsing (tree-sitter) fails due to code syntax errors during drafting in `workspace/`, the system MUST gracefully fall back to structure-aware or line-based chunking without crashing the background process.
- **Bounded Retries on Low Confidence:** Limit automated query rewriting retries to a hard maximum of 2 iterations per turn. If similarity remains below 0.60, return best-effort results tagged with `WARNING: Low confidence context` rather than continuing search loops.
- **Tokenizer Safety Buffer:** Subtract a mandatory 10% safety buffer from `max_prompt_tokens` before cutting off context chunks to avoid API context-overflow errors.

---

### 2.6 Resource Management & Event Debouncing

- **Watcher Event Debouncing:** The background file system watcher MUST debounce file change events with a 500ms–1000ms delay to batch rapid file writes (e.g., bulk file saves, git checkout).
- **Concurrency & CPU Caps:** Limit ONNX embedding workers to `N-1` CPU threads to prevent system thermal throttling and CLI UI lag during background indexing.
- **Non-Blocking Cold Starts:** Initial knowledge base indexing MUST run as an asynchronous background thread so the CLI agent is immediately interactive for general tasks upon startup.

---

## 3. Codebase Integration Constraints (Deepseek-Agentic-CLI)

> The RAG system MUST integrate into the existing Deepseek-Agentic-CLI codebase without collisions. This section maps every RAG component to the existing architecture so the implementing agent knows exactly where each piece belongs.

### 3.1 Technology & Runtime

- **Language:** JavaScript (ESM — `"type": "module"`)
- **Runtime:** Node.js
- **Existing dependencies to reuse:**
  - `tiktoken` → token counting (already in `lib/tokenizer.js`)
  - `pdfjs-dist` → PDF parsing (already used by `tools/extractContent.js`)
  - `mammoth` → DOCX parsing (already a dependency)
  - `ignore` → `.gitignore`-style pattern matching (reuse for `.ragignore`)
- **New dependencies required:** `lancedb`, `@fastembed/fastembed` (embeddings, e5-small INT8), `flashrank` (re-ranking, MultiBERT ONNX), `tree-sitter` + language grammars, `chokidar` (file watcher)

### 3.2 Directory Layout (new files only)

All RAG code MUST live under a new `lib/rag/` directory. No existing files in `lib/` or `tools/` should be modified except for registration and orchestrator hooks.

```
lib/rag/
├── index.js              # Public API: init(), search(), getStatus(), clean(), reindex()
├── watcher.js            # chokidar file watcher for knowledge/ and workspace/
├── chunker.js            # Prose chunking (structure-aware + semantic)
├── astChunker.js         # tree-sitter AST chunking for code files
├── embedder.js           # FastEmbed (e5-small INT8) embedding wrapper
├── vectorStore.js        # LanceDB embedded store wrapper
├── hybridSearch.js       # Dense + BM25 hybrid search + metadata filtering
├── reranker.js           # FlashRank (MultiBERT ONNX) cross-encoder wrapper
├── reflectionLoop.js     # Query rewriting loop + confidence thresholds
├── tokenBudget.js        # max_prompt_tokens enforcement + safety buffer
└── metadata.js           # Per-chunk metadata extraction + file hashing
```

Data directories (auto-created at runtime, added to `.gitignore`):
```
knowledge/                # User-managed permanent knowledge folder
workspace/                # User-managed active working directory
.rag/                     # Internal RAG data (index, DB, hashes)
├── lancedb/              # LanceDB storage files
├── hashes.json           # File hash cache for incremental indexing
└── config.json           # RAG runtime config (watched paths, thresholds)
```

### 3.3 Tool Registration Pattern

The RAG search tool MUST follow the existing `[schema, handler]` pattern in `tools/registry.js`:

- **New file:** `tools/ragSearch.js` — exports `rag_search_schema` and `rag_search` handler
- **Schema parameters:** `query` (string, required), `namespace` (string, optional), `layer` (enum: `"knowledge"` | `"workspace"` | `"both"`, default `"both"`), `top_k` (integer, default 5), `min_score` (number, default 0.60), `max_prompt_tokens` (integer, optional)
- **Registration:** Add to `ALL_TOOLS`, `ORCHESTRATOR_TOOLS`, and the `execution` role's `tools` array in `roleSystemPrompts.js`
- **No `needsConsent`:** RAG search is read-only — set consent flag to `false`
- **Return format:** JSON string matching existing tool return convention (via `createToolHandler` in `tools/template.js`)

### 3.4 Orchestrator Integration

The orchestrator (`lib/orchestrator.js`) manages the main chat loop. RAG integration hooks into it at these specific points:

1. **Startup initialization** (inside `runChat()`, after model selection):
   - Call `ragInit()` from `lib/rag/index.js` to start the file watcher and load the vector store
   - This MUST be non-blocking — the CLI prompt appears immediately; indexing runs in background

2. **System prompt update** (in `HYPERPARAMETERS.system_prompt`):
   - Add a `## RAG Context` section to the system prompt informing the agent that the `rag_search` tool is available and should be called automatically for local/internal knowledge tasks
   - This is prompt-level guidance only — the DeepSeek model decides when to invoke the tool based on task classification

3. **Token budget calculation** (before each `callModel()` invocation):
   - Use the existing `estimateTokens()` from `lib/tokenizer.js` to compute current conversation token usage
   - Pass `max_prompt_tokens = HYPERPARAMETERS.token_limit - currentTokens - MAX_OUTPUT_TOKENS` as a parameter when the agent invokes `rag_search`

4. **Shutdown cleanup** (on `/exit` or `/new`):
   - Call `ragShutdown()` to stop the file watcher and close the LanceDB connection

### 3.5 Policy Engine Compatibility

- RAG search is a **read-only** tool — it MUST NOT be added to `MUTATION_BLOCKED_TOOLS` in `lib/policyEngine.js`
- RAG search must be available in **both** Plan Mode and Agent Mode (it never mutates files)
- The watcher's background indexing writes only to `.rag/` internal storage — this is invisible to the policy engine

### 3.6 Sub-Agent Access

- The `rag_search` tool MUST be available to execution sub-agents via `buildSubagentTools()` in `tools/registry.js`
- Add `"rag_search"` to the `tools` array of the `execution` role in `tools/roleSystemPrompts.js`
- Sub-agents use the same schema and handler; no special sub-agent variant is needed

### 3.7 SessionContext Integration

Add the following fields to `SessionContext` in `lib/orchestrator.js`:

| Field | Type | Purpose |
|---|---|---|
| `ragReady` | `boolean` | `true` once initial indexing is complete |
| `ragChunkCount` | `number` | Total indexed chunks (updated by watcher) |
| `ragLastIndexTime` | `number` | Timestamp of last indexing run |

These fields are read by `/status` command to display RAG health alongside existing session info.

### 3.8 CLI Commands Integration

Add RAG admin commands to the existing `/help` command list and the slash-command handler in the orchestrator:

| Command | Handler | Action |
|---|---|---|
| `/rag status` | `ragStatus()` | Print index health, chunk count, watched paths, DB size |
| `/rag clean` | `ragClean()` | Remove orphaned index entries |
| `/rag reindex` | `ragReindex()` | Force full re-index of both watched folders |

These are user-facing admin commands only. They do NOT affect the agent's automatic retrieval behavior.

### 3.9 Files Modified (existing codebase)

Only these existing files require changes:

| File | Change |
|---|---|
| `tools/registry.js` | Import and register `rag_search` in `ALL_TOOLS`, `ORCHESTRATOR_TOOLS` |
| `tools/roleSystemPrompts.js` | Add `"rag_search"` to execution role's `tools` array |
| `lib/orchestrator.js` | Add `ragInit()`/`ragShutdown()` calls, add `ragReady`/`ragChunkCount`/`ragLastIndexTime` to `SessionContext`, add `/rag` slash commands, update system prompt |
| `.gitignore` | Add `.rag/`, `knowledge/`, `workspace/` entries |
| `package.json` | Add new dependencies: `lancedb`, `@fastembed/fastembed`, `flashrank`, `tree-sitter`, `chokidar` |

No other existing files are modified. All RAG logic lives in `lib/rag/` and `tools/ragSearch.js`.

### 2.5 Robustness & Fault Tolerance

- **AST Parsing Fallback:** If AST parsing (tree-sitter) fails due to code syntax errors during drafting in workspace/, the system MUST gracefully fall back to structure-aware or line-based chunking without crashing the background process.
- **Bounded Retries on Low Confidence:** Limit automated query rewriting retries to a hard maximum of 2 iterations per turn. If similarity remains below 0.60, return best-effort results tagged with "WARNING: Low confidence context" rather than continuing search loops.
- **Tokenizer Safety Buffer:** Subtract a mandatory 10% safety buffer from max_prompt_tokens before cutting off context chunks to avoid API context-overflow errors.

### 2.6 Resource Management & Event Debouncing

- **Watcher Event Debouncing:** The background file system watcher (chokidar/watchdog) MUST debounce file change events with a 500ms–1000ms delay to batch rapid file writes (e.g., bulk file saves, git checkout).
- **Concurrency & CPU Caps:** Limit ONNX embedding workers to $N-1$ CPU threads to prevent system thermal throttling and CLI UI lag during background indexing.
- **Non-Blocking Cold Starts:** Initial knowledge base indexing MUST run as an asynchronous background thread so the CLI agent is immediately interactive for general tasks upon startup.