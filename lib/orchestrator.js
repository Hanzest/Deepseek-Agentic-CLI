import OpenAI from "openai";
import dotenv from "dotenv";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { ask, askYesNo, startChat, thinkingToggle, createPromptLoop, askSearchKeyword, selectFromList } from "./cliInput.js";
import { estimateTokens, _estimate_text_tokens, _estimate_tool_call_tokens } from "./tokenizer.js";
import { printStreamResponse, startSpinner, stopSpinner } from "./streamHandler.js";
import fs from "fs";
import { ORCHESTRATOR_TOOLS, callToolsInBatch } from "../tools/registry.js";
import * as rag from "./rag/index.js";
import { clearReadOnlyCache } from "../tools/callToolsInBatch.js";
import { saveChatHistory, saveAuditHistory, sanitizeFilename, findChatFiles } from "./chatHistory.js";
import { archiveActiveToHistory, copyActiveToHistory } from "./artifactManager.js";
import { C, colorize } from "./colors.js";
import { MarkdownRenderer } from "./markdownFormatter.js";
import { parseRagMode, stripRagTag, resolveRagSearch } from "./ragMode.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Working directory: capture the directory the user launched the CLI from.
// The agent's default working directory is the user's current path, NOT the
// repo root (location of main.js). We deliberately do NOT process.chdir() to
// the repo root so that every tool (get_project_tree, read_file_chunk,
// patch_file, write_or_create_file, execute_terminal_command, ...) operates
// relative to the user's CWD.
// ---------------------------------------------------------------------------
const USER_WORKING_DIR = process.cwd();
const REPO_ROOT = path.join(__dirname, "..");
const SKILLS_DIR = path.join(REPO_ROOT, "docs", "skills");

// NOTE: The repo root is intentionally NOT set as the working directory.
// The agent's default working directory must be the user's current path.

dotenv.config({ path: path.join(__dirname, "..", ".env") });

// Client and config are set dynamically after model selection in runChat().
// Formerly created at module load; now lazy-initialized at runtime.
let client = null;
let activeModelConfig = null;

export function getActiveModelConfig() {
    return activeModelConfig;
}



// ---------------------------------------------------------------------------
// Session Context
//
// Wraps mutable session state in a single object that is passed down the
// execution chain. This avoids module-level mutable globals that would cause
// race conditions in a multi-tenant scenario.
// ---------------------------------------------------------------------------
const SessionContext = {
    agentMode: "plan",         // "plan" | "agent"
    autoSave: null,            // null = unset, true = auto-save every turn, false = ask only on /save or exit
    verbose: false,            // true = show telemetry details (iteration summary, per-turn token dump)
    firstTurn: true,           // true for the very first prompt, false after
    workDirInjected: false,    // true once the working directory has been injected into a user prompt
    chatTitle: null,           // LLM-generated title from first user message; reused for all saves
    messageCount: 0,           // track total user+assistant message count
    iterationCalls: [],        // per-turn telemetry records (only collected when verbose)
    accumulatedInputTokens: 0, // running tally of input tokens across all API calls
    accumulatedOutputTokens: 0, // running tally of output/completion tokens across all API calls
    orchestratorInputTokens: 0, // orchestrator input tokens to calculate cache_miss
    turnAuditTrail: [],        // [{ turnNumber, subAgents: [...] }] - per-turn sub-agent telemetry
    currentTurnSubAgents: [],  // sub-agent audit records for the current turn
    turnCounter: 0,            // incremented each new user message
    showTokenFooter: false,    // /footer toggle - token usage footer shown only when true
    ragReady: false,           // true once RAG initial indexing completes
    ragChunkCount: 0,          // total indexed chunks (updated by watcher)
    ragLastIndexTime: 0,       // timestamp (ms) of last RAG indexing run
    ragMode: "auto",           // "auto" | "manual" | "off" — RAG invocation policy
};

export { SessionContext, PRICING, getAuditData, getSessionMemoryContent, getActiveMessages, printPerToolAudit };

// Pricing per 1M tokens (USD)
const PRICING = {
    "deepseek-v4-flash": { input: 0.0028, output: 0.28, cache_miss: 0.14 },
    "deepseek-v4-pro": { input: 0.003625, output: 0.87, cache_miss: 0.435 },
};

const MAX_OUTPUT_TOKENS = 32768;

const HYPERPARAMETERS = {
    token_limit: 600000,
    token_multiplier: 1.5,
    stream: true,
    reasoning_effort: "high",
    iteration_limit: 30,
    iteration_continue_budget: 25,
    system_prompt:
        `
            ## Role
            - An expert Orchestrator for a team of Execution sub-agents.
            - You must execute yourself if you have no clear plan, or the plan requires minimal modifications
            to the codebase (less than 15 files created/modified/deleted).

            ## Technical Environment
            - **OS:** Windows
            - **Terminal:** PowerShell (Ensure all scripts and commands are .ps1 compatible)

            ## Source of Truth
            1. **Primary:** User Requirements and Preferences
            2. **Secondary:** Industry Engineering Standards (SOLID, DRY, clean code, maintainability)
            3. **Tertiary:** Domain-specific \`SKILL.md\` files indexed in the RAG knowledge base

            ---

            ## Tools Usage

            ### 1. Batch-first mandate
            Must leverage batch tool-calling to execute tools all-at-once.
            Only call sequentially if the next tool's input depends on the previous one's output.

            ### 2. Similar-tool disambiguation
            - **Knowledge retrieval (ALWAYS PREFER):** Use \`rag_search\` to find skills, reference docs, workspace files, and project context. This replaces manual tree scanning and file searching for indexed content.
            - **Exploration:** Use \`get_project_tree\` only for directories NOT indexed by RAG (e.g., \`node_modules\`, external repos). For indexed \`knowledge/\` and \`workspace/\` folders, use \`rag_search\`.
            - **File Reading:** Use \`read_file_chunk\` when the exact path and line range are already known. Use \`rag_search\` when you need to find which file contains relevant information.
            - **File Modifications:** prefer \`patch_file\` for small edits ≤~20 lines; use \`write_or_create_file\` for entirely new files or large structural rewrites.
            - **String Search:** Use \`multi_file_search_string\` only for exact string/regex matches in unindexed directories. For semantic/topic-based search, use \`rag_search\`.

            ### 3. RAG invocation rules
            A local RAG subsystem indexes \`knowledge/\` (permanent reference) and \`workspace/\` (active working) folders automatically. The \`rag_search\` tool is available.

            **Auto-invoke \`rag_search\` (without user asking) for:**
            | Task type | Layer | Examples |
            |---|---|---|
            | Skill/domain lookup | \`knowledge\` | Any task involving writing, reviewing, coding, or domain work — search for matching SKILL.md |
            | Local file operations | \`workspace\` | Reading, summarizing, searching local project files |
            | Reference lookup | \`knowledge\` | Finding information in textbooks, research papers, style guides |
            | Writing with references | \`both\` | Drafting reports, rewriting sections, feedback on documents |
            | Code understanding | \`workspace\` | Debugging, explaining, or navigating codebase |

            **Do NOT invoke \`rag_search\` for:**
            - General conversation ("hello", "thanks")
            - Pure LLM reasoning ("explain what a hash table is")
            - Web/internet searches (use \`fetch_url\` or \`search_web\`)
            - Translation tasks with no local reference needed

            **When invoking:** Formulate 1-2 precise retrieval queries. Scope \`namespace\`/\`layer\` when the target is obvious. Pass \`max_prompt_tokens\` when given. Injected chunks carry \`file_path\` + \`line_start\`/\`line_end\` — always cite sources as \`file.md:lines 12-25\`. Treat \`WARNING: Low confidence context\` results as unverified.

            ### 4. RAG mode control & fast-path (\`search_mode\`)
            The session RAG mode (see \`/rag mode auto|manual|off\`) governs automatic invocation:
            - **auto** (default): \`rag_search\` is available; use it per the rules above.
            - **manual**: only invoke \`rag_search\` when the user explicitly asks (or tags \`@rag\`).
            - **off**: \`rag_search\` is removed from the tool list entirely.
            User intent tags (stripped before they reach the model; results injected when present):
            - \`@rag\`, \`@rag:keyword\`, \`@rag:exact\` force a deterministic search whose results are injected into the conversation context.
            For exact-token / keyword lookups, prefer \`search_mode: "keyword"\` — a pure in-memory BM25 fast-path (~2-5ms, zero ONNX CPU). Use \`search_mode: "dense"\` for semantic-only retrieval, or omit it for hybrid (dense + BM25 + rerank).

            ---

            ## Automatic Skill Detection (MUST Execute on Every Task)

            Before any planning or execution, you MUST check if a relevant skill exists:

            1. **Classify the task domain** — identify keywords: writing, feedback, review, API, database, testing, UI/UX, security, Docker, CI/CD, documentation, performance, CLI, etc.
            2. **Search for matching skill** — call \`rag_search\` with:
               - \`query\`: the task domain keywords (e.g., "academic writing", "group project feedback", "API design")
               - \`namespace\`: skills directory scope
               - \`layer\`: \`"knowledge"\`
               - \`top_k\`: 3
            3. **If a skill is found** (score ≥ 0.60): Read it via \`read_file_chunk\` and apply its rules, constraints, and anti-patterns to ALL subsequent work. The skill's rules override your defaults.
            4. **If no skill matches** (score < 0.60 or no results): Proceed with general best practices.

            This replaces the old 3-step manual skill scanning. One \`rag_search\` call replaces \`get_project_tree\` + \`multi_file_search_string\` + \`read_file_chunk\`.

            **Skill auto-match examples:**
            | User says | Skill to auto-load |
            |---|---|
            | "Review my teammate's report section" | \`group-project-feedback\` |
            | "Write the literature review for my paper" | \`academic-writing-clarification\` |
            | "Design the REST API for user management" | \`api-design\` |
            | "Set up the Docker deployment" | \`docker\` |
            | "Add unit tests for the auth module" | \`testing-quality\` |
            | "Optimize the database queries" | \`database\` + \`performance\` |

            The user does NOT need to mention the skill name. You infer it from the task.

            ---

            ## Mandatory Planning Pipeline

            ### Step 1: Context Gathering (Must Execute First — Single Batch)
            Before prompting the user or drafting a plan, issue these in ONE batch call:
            1. **Skill search** — \`rag_search(query: "<task domain keywords>", layer: "knowledge", top_k: 3)\`
            2. **Workspace context** — \`rag_search(query: "<task-specific query>", layer: "workspace", top_k: 5)\` (only if the task involves local files)
            3. **Read matched skill** — \`read_file_chunk\` on the top skill result (if score ≥ 0.60)

            All three can be batched into a single turn.

            ### Step 2: Clarification Threshold
            *Do not make blind assumptions. Use the context gathered in Step 1 to evaluate your next move:*
            - **Scenario A (High-Level/Open-Ended):** If the request involves high-level architectural visions,
            future product roadmaps, or open-ended documentation, you **MUST** ask the user to clarify the scope.
            - **Scenario B (Standard Coding/Features):** For bug fixes, standard features, or localized tasks,
            provide the user with a distinct choice of 2-3 modern, industry-standard assumptions or
            implementation paths. Ask for their preference before proceeding.

            ### Step 3 - Conduct Implementation Plan (Plan Mode Only)
                **Plan Template**
                Once requirements are clear, generate a comprehensive implementation plan. The plan must be
                saved as an artifact in the \`Deepseek-Agentic-CLI/artifacts/active/\` folder and include the following sections:
                - **Overall Approach:** A high-level description of how you will tackle the task.
                - **Important Notes:** Any assumptions, clarifying questions for the user, or preferences
                you noted from asking the user before creating this plan.
                - **Open Questions:** Remaining questions that require clarification from the user to proceed.
                If all is clear, write "All Clear".
                - **Execution Phases & Delegation Strategy**: A breakdown of the work into discrete,
                delegatable tasks. Organize tasks by "Tiers" or specify dependencies to indicate
                parallelization opportunities. Use a markdown table with the following columns:
                    - **Task ID:** A unique identifier
                    - **Task Name:** A concise name for the task.
                    - **Description:** Actionable scope of work for the delegated agent.
                    - **Dependencies:** Which Task IDs must be completed first (Use "None" for
                    independent, parallelizable tasks).
                    - **Target Files:** The specific files this task will affect.
                - **Proposed Changes:** Markdown tables of files to be created, modified, or deleted,
                with a brief description of the change for each. Reference structural functions or variables,
                not line numbers. Link these to the Task IDs above.
                - **Verification Plan:** A list of to-do for the execution agent to verify the plan
                implementation quality. Existing automated tests are preferred than manual checks.

            ### Step 4 - Proceed with Implementation (Agent Mode Only)
                - Only triggers when user approves the plan or user requests to proceed
                with implementation.
                - If approved, you will delegate to execution agent only after you have
                the plan from Step 3.

            ---

            ## Output Constraints
            - **Architecture:** Default to strict 'DRY' and 'SOLID' principles for code generation.
            - **UI/UX Requirements:** Ensure any user-facing interfaces are highly interactive and reactive to optimize user experience.
            - **Format:** Keep outputs highly concise, technical, and formatted in clean Markdown.
        `
};

// ---------------------------------------------------------------------------
// RAG lifecycle helpers (lib/rag/index.js). Init is non-blocking; the file
// watcher indexes knowledge/ + workspace/ in the background.
// ---------------------------------------------------------------------------
let ragMessagesRef = []; // latest conversation messages, for token-budget estimation

async function ragInit() {
    try {
        await rag.init({
            onStatus: (s) => {
                if (!s) return;
                if (typeof s.ragReady === "boolean") SessionContext.ragReady = s.ragReady;
                if (typeof s.ragChunkCount === "number") SessionContext.ragChunkCount = s.ragChunkCount;
                if (typeof s.ragLastIndexTime === "number") SessionContext.ragLastIndexTime = s.ragLastIndexTime;
            },
        });
        // Token budget estimator: max_prompt_tokens = token_limit - current - reserved output.
        rag.setBudgetEstimator(() => {
            try {
                const currentInput = estimateTokens(
                    getActiveMessages(ragMessagesRef),
                    "",
                    HYPERPARAMETERS.token_multiplier
                ).input_tokens;
                return Math.max(0, HYPERPARAMETERS.token_limit - currentInput - MAX_OUTPUT_TOKENS);
            } catch {
                return Math.max(0, HYPERPARAMETERS.token_limit - MAX_OUTPUT_TOKENS);
            }
        });
    } catch (e) {
        console.log(colorize(`[RAG] Init warning: ${e.message}`, C.dim));
    }
}

async function ragShutdown() {
    try {
        await rag.shutdown();
    } catch (e) {
        console.log(colorize(`[RAG] Shutdown warning: ${e.message}`, C.dim));
    }
}

function ragStatusCmd() {
    (async () => {
        try {
            const s = await rag.getStatus();
            if (!s) {
                console.log(colorize("  [RAG] Status unavailable (not initialized).", C.warning));
                return;
            }
            console.log("");
            console.log(colorize("  RAG Status:", C.heading));
            console.log(`  Ready:      ${colorize(s.ready ? "yes" : "no", C.system)}`);
            console.log(`  Chunks:     ${colorize(String(s.chunkCount ?? 0), C.system)}`);
            console.log(`  DB size:    ${colorize(formatBytes(s.dbSize ?? 0), C.system)}`);
            console.log(`  Last index: ${colorize(s.lastIndexTime ? new Date(s.lastIndexTime).toLocaleTimeString() : "never", C.system)}`);
            console.log(`  Embedder:   ${colorize(s.modelAvailable ? "available" : "not loaded (BM25-only)", C.system)}`);
            console.log(`  Mode:       ${colorize(String(SessionContext.ragMode ?? "auto"), C.system)} (auto | manual | off)`);
            if (Array.isArray(s.watchedPaths)) {
                console.log(`  Watched:`);
                for (const p of s.watchedPaths) console.log(`    - ${colorize(p, C.dim)}`);
            }
            console.log("");
        } catch (e) {
            console.log(colorize(`  [RAG] Status error: ${e.message}`, C.error));
        }
    })();
}

function ragCleanCmd() {
    (async () => {
        console.log(colorize("  [RAG] Cleaning orphaned index entries...", C.system));
        try {
            const removed = await rag.clean();
            console.log(colorize(`  [RAG] Clean done (removed ${removed ?? 0} orphaned entries).`, C.success));
        } catch (e) {
            console.log(colorize(`  [RAG] Clean error: ${e.message}`, C.error));
        }
    })();
}

function ragReindexCmd() {
    (async () => {
        console.log(colorize("  [RAG] Full re-index started in background...", C.system));
        try {
            await rag.reindex();
            console.log(colorize("  [RAG] Re-index completed.", C.success));
        } catch (e) {
            console.log(colorize(`  [RAG] Re-index error: ${e.message}`, C.error));
        }
    })();
}

/**
 * `/rag search [--mode=hybrid|keyword|dense] <query>` — direct deterministic
 * retrieval with a printable result list. `--mode=keyword` exercises the
 * pure in-memory BM25 fast-path (zero ONNX / FlashRank).
 * @param {string} sub - Lowercased sub-command string after "/rag ".
 * @returns {Promise<void>}
 */
async function ragSearchCmd(sub) {
    let rest = sub.slice("search".length).trim();
    let mode = "hybrid";
    const modeMatch = /--mode=(hybrid|keyword|dense)/.exec(rest);
    if (modeMatch) {
        mode = modeMatch[1];
        rest = rest.replace(modeMatch[0], "").trim();
    }
    if (!rest) {
        console.log(colorize("  Usage: /rag search [--mode=hybrid|keyword|dense] <query>", C.dim));
        return;
    }
    console.log(colorize(`  [RAG] Searching (${mode})...`, C.system));
    const t0 = Date.now();
    try {
        const out = await rag.search({ query: rest, top_k: 5, min_score: 0.0, search_mode: mode });
        const elapsed = Date.now() - t0;
        const hits = out.results || [];
        if (hits.length === 0) {
            console.log(colorize(`  [RAG] No results (${elapsed}ms).`, C.warning));
            return;
        }
        console.log("");
        for (const r of hits) {
            const loc = r.file_path ? `${r.file_path}${r.line_start != null ? `:${r.line_start}-${r.line_end ?? ""}` : ""}` : "?";
            console.log(colorize(`  • [${Number(r.score ?? 0).toFixed(3)}] ${loc}`, C.tool));
            if (r.namespace) console.log(`    namespace=${r.namespace}  layer=${r.layer ?? ""}`);
            const snippet = String(r.text ?? "").replace(/\s+/g, " ").slice(0, 180);
            console.log(`    ${colorize(snippet, C.dim)}`);
            console.log("");
        }
        console.log(colorize(`  [RAG] ${hits.length} result(s) in ${elapsed}ms (mode=${mode}).`, C.system));
    } catch (e) {
        console.log(colorize(`  [RAG] Search error: ${e.message || e}`, C.error));
    }
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

async function callModel(
    model_name,
    token_limit,
    messages,
    stream,
    extra_body,
    reasoning_effort,
    tools = null
) {
    const activeMessages = getActiveMessages(messages);
    const kwargs = {
        model: model_name,
        messages: activeMessages,
        max_tokens: token_limit,
        stream: stream,
    };

    if (tools) {
        kwargs.tools = tools;
    }

    // DeepSeek: thinking.type = "enabled" | "disabled"
    if (extra_body?.thinking) {
        kwargs.thinking = extra_body.thinking;
        if (extra_body.thinking.type !== "disabled") {
            kwargs.reasoning_effort = reasoning_effort;
        }
    }
    // Gemini: reasoning_effort must NOT be set as a top-level parameter.
    // Gemini's OpenAI-compatible endpoint rejects unknown top-level fields
    // with a 400 (no body) error. If Gemini-native thinking config is needed
    // in the future, pass it via the SDK's extra_body mechanism.




    return client.chat.completions.create(kwargs);
}

/**
 * Determines the "type" of a native API call based on the last message
 * in the conversation history.
 * @param {Array} messages - The conversation message array
 * @returns {string} One of: "user_input", "tool_result", "assistant", "system"
 */
function determineCallType(messages) {
    if (messages.length === 0) return "system";
    const lastRole = messages[messages.length - 1]?.role ?? "system";
    switch (lastRole) {
        case "user":
            return "user_input";
        case "tool":
            return "tool_result";
        case "assistant":
            return "assistant";
        default:
            return "system";
    }
}

function printSessionBanner(model_name, thinking) {
    const modeLabel = SessionContext.agentMode === "plan"
        ? "Plan (file mutation blocked)"
        : "Agent (all tools available)";
    const thinkingLabel = thinking?.reasoning_effort
        ? thinking.reasoning_effort                    // Gemini: "minimal"|"low"|"medium"|"high"
        : (thinking?.thinking?.type === "enabled" ? "enabled" : "disabled"); // DeepSeek

    const W = 60;
    const sep = colorize("═".repeat(W), C.border);

    console.log("");
    console.log(sep);
    console.log(colorize(`  Model:    ${model_name}`, C.heading));
    console.log(colorize(`  Mode:     ${modeLabel}`, C.heading));
    console.log(colorize(`  Thinking: ${thinkingLabel}`, C.heading));
    console.log(colorize(`  Tokens:   ${HYPERPARAMETERS.token_limit.toLocaleString()} limit`, C.heading));
    console.log(colorize(`  Work Dir:  ${USER_WORKING_DIR}`, C.heading));
    console.log(colorize(`  Type /help for available commands`, C.dim));
    console.log(sep);
    console.log("");
}

function printHelp() {
    console.log("");
    console.log(colorize("  Available commands:", C.heading));
    console.log(`  ${colorize("/plan", C.tool)}     - Switch to Plan Mode (mutation blocked, artifacts/active/ exempt)`);
    console.log(`  ${colorize("/agent", C.tool)}    - Switch to Agent Mode (all tools available)`);
    console.log(`  ${colorize("/exit", C.tool)}     - Quit the chat session`);
    console.log(`  ${colorize("/save", C.tool)}     - Save current session now`);
    console.log(`  ${colorize("/clear", C.tool)}    - Clear the terminal`);
    console.log(`  ${colorize("/status", C.tool)}   - Show session info + RAG index state (chunks, dense/BM25)`);
    console.log(`  ${colorize("/verbose", C.tool)}  - Toggle detailed telemetry on/off`);
    console.log(`  ${colorize("/footer", C.tool)}   - Toggle token usage footer on/off (default off)`);
    console.log(`  ${colorize("/audit", C.tool)}    - Show sub-agent token & cost breakdown with orchestrator totals`);
    console.log(`  ${colorize("/skills", C.tool)}   - List available domain guides in docs/skills/`);
    console.log(`  ${colorize("/new", C.tool)}      - Start a new conversation (clears history & memory)`);
    console.log(`  ${colorize("/load", C.tool)}     - List/load previous conversations`);
    console.log(`  ${colorize("/title", C.tool)}    - View or set chat session title`);
    console.log(`  ${colorize("/rag status", C.tool)}   - Show RAG index health + current mode`);
    console.log(`  ${colorize("/rag clean", C.tool)}    - Remove orphaned RAG index entries`);
    console.log(`  ${colorize("/rag reindex", C.tool)}  - Force full RAG re-index`);
    console.log(`  ${colorize("/rag mode", C.tool)}     - Set RAG mode: /rag mode auto|manual|off`);
    console.log(`  ${colorize("/rag search", C.tool)}   - Direct search: /rag search [--mode=keyword] <query>`);
    console.log(`  ${colorize("/help", C.tool)}     - Show this help`);
    console.log("");
}

async function printStatus(model_name, messages, token_estimates, thinking) {
    const modeLabel = SessionContext.agentMode === "plan" ? "Plan" : "Agent";
    const thinkingLabel = thinking?.reasoning_effort
        ? thinking.reasoning_effort                    // Gemini
        : (thinking?.thinking?.type === "enabled" ? "enabled" : "disabled"); // DeepSeek
    const verboseLabel = SessionContext.verbose ? "on" : "off";
    const autoSaveLabel = SessionContext.autoSave === true ? "on" : (SessionContext.autoSave === false ? "off" : "unset");
    const pctUsed = ((token_estimates.total_tokens / HYPERPARAMETERS.token_limit) * 100).toFixed(1);

    console.log("");
    console.log(colorize("  Session Status:", C.heading));
    const titleLabel = SessionContext.chatTitle
        ? SessionContext.chatTitle
        : colorize("(generating...)", C.dim);
    console.log(`  Mode:       ${colorize(modeLabel, C.system)}`);
    console.log(`  Title:      ${colorize(titleLabel, C.system)}`);
    console.log(`  Model:      ${colorize(model_name, C.system)}`);
    console.log(`  Thinking:   ${colorize(thinkingLabel, C.system)}`);
    console.log(`  Messages:   ${colorize(String(messages.length - 1), C.system)} (excl. system prompt)`);
    console.log(`  Tokens:     ${colorize(`${token_estimates.total_tokens.toLocaleString()} / ${HYPERPARAMETERS.token_limit.toLocaleString()} (${pctUsed}%)`, C.system)}`);
    console.log(`  Acc. input: ${colorize(SessionContext.accumulatedInputTokens.toLocaleString() + " tokens", C.system)}`);
    // RAG status: query the live index when available; fall back to cached state
    // (covers the window before the watcher's first status emission).
    let ragLabel = SessionContext.ragReady ? "ready" : "indexing...";
    let ragChunks = SessionContext.ragChunkCount;
    let ragMode = "";
    try {
        const s = await rag.getStatus();
        if (s) {
            ragLabel = s.ready ? "ready" : "indexing...";
            ragChunks = s.chunkCount ?? ragChunks;
            ragMode = s.modelAvailable ? ", dense" : ", BM25-only";
        }
    } catch { /* keep cached values */ }
    console.log(`  RAG:        ${colorize(ragLabel, C.system)} (${Number(ragChunks).toLocaleString()} chunks${ragMode})`);

    // Estimated cost: (accInput/1M * cacheHit) + (accOutput/1M * output) + (curInput/1M * cacheMiss)
    const rates = PRICING[model_name] || PRICING["deepseek-v4-flash"];
    const estCost = (SessionContext.accumulatedInputTokens / 1_000_000) * rates.input
        + (SessionContext.accumulatedOutputTokens / 1_000_000) * rates.output
        + (token_estimates.input_tokens / 1_000_000) * rates.cache_miss;
    console.log(`  Est. cost:  ${colorize("$" + estCost.toFixed(4), C.system)}`);

    console.log(`  Verbose:    ${colorize(verboseLabel, C.system)}`);
    console.log(`  Auto-save:  ${colorize(autoSaveLabel, C.system)}`);
    console.log("");
}

function getAuditData(model_name, token_estimates = null, messages = null) {
    const rates = PRICING[model_name] || PRICING["deepseek-v4-flash"];

    // Collect all sub-agent records across archived turns + current turn
    let allSubAgents = [];
    for (const turn of SessionContext.turnAuditTrail) {
        for (const sa of turn.subAgents) {
            allSubAgents.push(sa);
        }
    }
    for (const sa of SessionContext.currentTurnSubAgents) {
        allSubAgents.push(sa);
    }

    // Current turn data (if any sub-agents in-progress)
    let currentTurn = null;
    if (SessionContext.currentTurnSubAgents.length > 0) {
        currentTurn = {
            turnNumber: SessionContext.turnCounter + 1,
            subAgents: [...SessionContext.currentTurnSubAgents],
        };
    }

    // Grand total: sub-agents + orchestrator
    const saInputSum = allSubAgents.reduce((sum, sa) => sum + sa.accumulatedInputTokens, 0);
    const saOutputSum = allSubAgents.reduce((sum, sa) => sum + sa.outputTokens, 0);
    const saCostSum = allSubAgents.reduce((sum, sa) => sum + sa.estimatedCost, 0);

    // Unified 3-part formula matching /status Est. Cost:
    // (accInput × input_rate) + (accOutput × output_rate) + (cacheMissTokens × cache_miss_rate)
    // Priority: 1) token_estimates param (display path), 2) estimate from messages (save path), 3) orchestratorInputTokens (fallback)
    let estimatedTokenEstimates = null;
    let cacheMissTokens;
    if (token_estimates) {
        cacheMissTokens = token_estimates.input_tokens;
        estimatedTokenEstimates = {
            input_tokens: token_estimates.input_tokens,
            output_tokens: token_estimates.output_tokens,
            total_tokens: token_estimates.total_tokens,
        };
    } else if (messages && messages.length > 0) {
        const est = estimateTokens(getActiveMessages(messages), "", 1.5);
        cacheMissTokens = est.input_tokens;
        estimatedTokenEstimates = {
            input_tokens: est.input_tokens,
            output_tokens: est.output_tokens,
            total_tokens: est.total_tokens,
        };
    } else {
        cacheMissTokens = SessionContext.orchestratorInputTokens;
    }
    const orchCost = (SessionContext.accumulatedInputTokens / 1_000_000) * rates.input
        + (SessionContext.accumulatedOutputTokens / 1_000_000) * rates.output
        + (cacheMissTokens / 1_000_000) * rates.cache_miss;

    const grandInput = SessionContext.accumulatedInputTokens + saInputSum;
    const grandOutput = SessionContext.accumulatedOutputTokens + saOutputSum;
    const grandCost = orchCost + saCostSum;

    return {
        model_name,
        turns: SessionContext.turnAuditTrail.map(t => ({
            turnNumber: t.turnNumber,
            subAgents: t.subAgents.map(sa => ({ ...sa })),
            orchestratorInput: t.orchestratorInput || 0,
        })),
        currentTurn,
        orchestrator: {
            accumulatedInputTokens: SessionContext.accumulatedInputTokens,
            accumulatedOutputTokens: SessionContext.accumulatedOutputTokens,
            orchestratorInputTokens: SessionContext.orchestratorInputTokens,
            estimatedCost: orchCost,
            tokenEstimates: estimatedTokenEstimates,
        },
        grandTotal: {
            inputTokens: grandInput,
            outputTokens: grandOutput,
            estimatedCost: grandCost,
        },
    };
}

function printPerToolAudit(messages, model_name) {
    const rates = PRICING[model_name] || PRICING["deepseek-v4-flash"];
    const multiplier = HYPERPARAMETERS.token_multiplier || 1.6;

    const toolMetrics = {};

    for (const msg of messages) {
        if (msg.role === "assistant" && msg.tool_calls) {
            for (const tc of msg.tool_calls) {
                const name = tc.function?.name;
                if (!name) continue;
                if (!toolMetrics[name]) {
                    toolMetrics[name] = { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
                }
                toolMetrics[name].calls++;
                const tcTokens = _estimate_tool_call_tokens(tc, multiplier);
                toolMetrics[name].outputTokens += tcTokens;
            }
        }
        if (msg.role === "tool") {
            const name = msg.name;
            if (!name) continue;
            if (!toolMetrics[name]) {
                toolMetrics[name] = { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
            }
            const contentTokens = _estimate_text_tokens(msg.content, multiplier);
            toolMetrics[name].inputTokens += contentTokens;
        }
    }

    const toolNames = Object.keys(toolMetrics).sort();
    if (toolNames.length === 0) return;

    console.log(colorize("║  Per-Tool Token & Cost Breakdown" + " ".repeat(66) + "║", C.heading));
    console.log(colorize("╟" + "─".repeat(100) + "╢", C.border));
    const header = "  Tool Name                 Calls   Input Tokens    Output Tokens    Total Tokens    Est. Cost";
    console.log(colorize(header, C.system));

    for (const name of toolNames) {
        const m = toolMetrics[name];
        m.inputTokens = Math.round(m.inputTokens);
        m.outputTokens = Math.round(m.outputTokens);
        m.cost = (m.inputTokens / 1_000_000) * rates.input + (m.outputTokens / 1_000_000) * rates.output;

        const toolNameLabel = name.length > 24 ? name.substring(0, 21) + "..." : name.padEnd(24);
        const calls = (" " + String(m.calls)).padStart(8);
        const inp = (" " + m.inputTokens.toLocaleString()).padStart(15);
        const out = (" " + m.outputTokens.toLocaleString()).padStart(15);
        const total = (" " + (m.inputTokens + m.outputTokens).toLocaleString()).padStart(15);
        const cost = " $" + m.cost.toFixed(4);

        console.log(
            `  ${colorize(toolNameLabel, C.tool)} ${calls}  ${inp}  ${out}  ${total}  ${colorize(cost.padStart(11), C.warning)}`
        );
    }
    console.log(colorize("╟" + "─".repeat(100) + "╢", C.border));
}

function printAudit(model_name, token_estimates = null, messages = null) {
    const data = getAuditData(model_name, token_estimates, messages);

    // Collect all sub-agent records
    let allSubAgents = [];
    for (const turn of data.turns) {
        for (const sa of turn.subAgents) {
            allSubAgents.push(sa);
        }
    }
    if (data.currentTurn) {
        for (const sa of data.currentTurn.subAgents) {
            allSubAgents.push(sa);
        }
    }

    console.log("");
    console.log(colorize("╔" + "═".repeat(100) + "╗", C.border));

    const hasTools = messages && messages.some(msg => msg.role === "tool" || (msg.role === "assistant" && msg.tool_calls && msg.tool_calls.length > 0));
    if (allSubAgents.length === 0 && data.turns.length === 0 && !data.currentTurn && !hasTools) {
        console.log(colorize("║  No sub-agents or tool calls have been recorded yet in this session. ║", C.dim));
        console.log(colorize("╚" + "═".repeat(100) + "╝", C.border));
        console.log("");
        return;
    }

    // Print Per-Tool Token & Cost breakdown first!
    if (messages && messages.length > 0) {
        printPerToolAudit(messages, model_name);
    }

    // Per-turn breakdown (archived turns)
    for (const turn of data.turns) {
        if (turn.subAgents.length === 0 && !turn.orchestratorInput) continue;

        console.log(colorize(
            `║  Turn ${turn.turnNumber}` + " ".repeat(93 - String(turn.turnNumber).length) + "║",
            C.heading
        ));
        console.log(colorize("╟" + "─".repeat(100) + "╢", C.border));

        // Header
        const header = "  Role                    Msgs   Input Tokens     Output Tokens    Accum. Tokens    Est. Cost";
        console.log(colorize(header, C.system));

        for (const sa of turn.subAgents) {
            const roleLabel = (sa.type || sa.name || "unknown");
            const role = roleLabel.length > 22 ? roleLabel.substring(0, 19) + "..." : roleLabel.padEnd(22);
            const msgs = (" " + String(sa.messages)).padStart(6);
            const inp = (" " + Math.round(sa.inputTokens).toLocaleString()).padStart(15);
            const out = (" " + Math.round(sa.outputTokens).toLocaleString()).padStart(15);
            const acc = (" " + Math.round(sa.accumulatedInputTokens).toLocaleString()).padStart(15);
            const cost = " $" + sa.estimatedCost.toFixed(4);

            console.log(
                `  ${colorize(role, C.tool)} ${msgs}  ${inp}  ${out}  ${acc}  ${colorize(cost, C.warning)}`
            );
        }

        console.log(colorize("╟" + "─".repeat(100) + "╢", C.border));
    }

    // Current turn (if any sub-agents in-progress, not yet archived)
    if (data.currentTurn) {
        const turn = data.currentTurn;
        console.log(colorize(
            `║  Turn ${turn.turnNumber} (in progress)` + " ".repeat(58 - String(turn.turnNumber).length) + "║",
            C.heading
        ));
        console.log(colorize("╟" + "─".repeat(100) + "╢", C.border));

        const header = "  Role                    Msgs   Input Tokens     Output Tokens    Accum. Tokens    Est. Cost";
        console.log(colorize(header, C.system));

        for (const sa of turn.subAgents) {
            const roleLabel = (sa.type || sa.name || "unknown");
            const role = roleLabel.length > 22 ? roleLabel.substring(0, 19) + "..." : roleLabel.padEnd(22);
            const msgs = (" " + String(sa.messages)).padStart(6);
            const inp = (" " + Math.round(sa.inputTokens).toLocaleString()).padStart(15);
            const out = (" " + Math.round(sa.outputTokens).toLocaleString()).padStart(15);
            const acc = (" " + Math.round(sa.accumulatedInputTokens).toLocaleString()).padStart(15);
            const cost = " $" + sa.estimatedCost.toFixed(4);

            console.log(
                `  ${colorize(role, C.tool)} ${msgs}  ${inp}  ${out}  ${acc}  ${colorize(cost, C.warning)}`
            );
        }

        console.log(colorize("╟" + "─".repeat(100) + "╢", C.border));
    }

    // --- TOTAL ORCHESTRATOR ---
    console.log(colorize("  TOTAL ORCHESTRATOR", C.heading));
    console.log(`  Accumulated Input: ${data.orchestrator.accumulatedInputTokens.toLocaleString()} tokens`);
    if (data.orchestrator.tokenEstimates) {
        console.log(`  Input Tokens:      ${data.orchestrator.tokenEstimates.total_tokens.toLocaleString()} tokens`);
        console.log(`  Output Tokens:     ${data.orchestrator.tokenEstimates.output_tokens.toLocaleString()} tokens`);
    }
    console.log(`  Est. Cost:         ${colorize("$" + data.orchestrator.estimatedCost.toFixed(4), C.warning)}`);
    console.log("");

    // --- GRAND TOTAL (Orchestrator + All Sub-Agents) ---
    console.log(colorize("  GRAND TOTAL (Orchestrator + All Sub-Agents)", C.heading));
    console.log(colorize(
        `  Input: ${data.grandTotal.inputTokens.toLocaleString()} tokens  |  Output: ${data.grandTotal.outputTokens.toLocaleString()} tokens  |  Est. Cost: ${data.grandTotal.estimatedCost.toFixed(4)}`,
        C.success
    ));
    console.log(colorize("╚" + "═".repeat(100) + "╝", C.border));
    console.log("");
}


function printModeSwitch(newMode) {
    const W = 60;
    const sep = colorize("─".repeat(W), C.border);
    const label = newMode === "plan"
        ? "Plan Mode - file mutation and system execution are now restricted (artifacts/active/ exempt)"
        : "Agent Mode - all tools available.";
    const color = newMode === "plan" ? C.system : C.success;

    console.log(sep);
    console.log(colorize(`  [Mode] Switched to ${label}`, color));
    console.log(colorize(`  Type /clear to clear the screen.`, C.dim));
    console.log(sep);
}

function printCompactTokens(token_estimates) {
    const pct = token_estimates.total_tokens / HYPERPARAMETERS.token_limit;
    const thresholds = [0.15, 0.25, 0.5, 0.75, 0.9];
    const hit = thresholds.filter(t => pct >= t).pop(); // highest threshold hit
    if (!hit) return; // below 15% - silent

    const pctStr = (pct * 100).toFixed(0);
    const label = pct >= 0.9 ? C.error : (pct >= 0.75 ? C.warning : C.system);
    console.log(colorize(
        `[Context: ${pctStr}% of token budget used (${token_estimates.total_tokens.toLocaleString()} / ${HYPERPARAMETERS.token_limit.toLocaleString()}) | Acc. input: ${SessionContext.accumulatedInputTokens.toLocaleString()} tokens]`,
        label
    ));
}

/**
 * Prints a persistent token usage footer after every major turn event.
 * Shows current usage vs limit with visual cues that intensify near/over the limit.
 * Always visible (unlike printCompactTokens which only fires at thresholds >= 15%).
 */
function printTokenFooter(token_estimates) {
    const pct = token_estimates.total_tokens / HYPERPARAMETERS.token_limit;
    const isOver = pct > 1.0;
    const pctStr = (pct * 100).toFixed(1);

    // Color escalates with usage
    let color = C.dim;           // < 50%  → dim gray
    if (pct >= 1.0) color = C.error;      // >= 100% → red
    else if (pct >= 0.9) color = C.error; // >= 90%  → red
    else if (pct >= 0.75) color = C.warning; // >= 75%  → yellow
    else if (pct >= 0.5) color = C.system;   // >= 50%  → cyan

    const sep = isOver ? "═" : "─";
    const totalStr = token_estimates.total_tokens.toLocaleString();
    const limitStr = HYPERPARAMETERS.token_limit.toLocaleString();
    const accInStr = SessionContext.accumulatedInputTokens.toLocaleString();
    const accOutStr = SessionContext.accumulatedOutputTokens.toLocaleString();

    let line;
    if (isOver) {
        const overBy = (token_estimates.total_tokens - HYPERPARAMETERS.token_limit).toLocaleString();
        line = ` 🔥 Tokens: ${totalStr}/${limitStr} (${pctStr}%) ⚠️ OVER by ${overBy} tokens 🔥`;
    } else {
        line = ` ${sep.repeat(3)} Tokens: ${totalStr}/${limitStr} (${pctStr}%) ${sep.repeat(3)} Acc In: ${accInStr} ${sep.repeat(3)} Acc Out: ${accOutStr} ${sep.repeat(3)}`;
    }

    console.log(colorize(line, color));
}

function printIterationSummary(iterationCalls) {
    if (!SessionContext.verbose) return;

    const nativeCount = iterationCalls.length;
    let accumulatedTokens = 0;
    console.log(colorize("[Iteration Summary]", C.system));
    console.log(`Native API Calls This Turn: ${nativeCount}`);
    for (let i = 0; i < iterationCalls.length; i++) {
        const { type, inputTokens, toolCalled, toolsUsed, batchCall } = iterationCalls[i];
        accumulatedTokens += inputTokens;
        let toolInfo;
        if (!toolCalled) {
            toolInfo = "-";
        } else if (batchCall) {
            toolInfo = `[${toolsUsed.join(", ")}] (batch)`;
        } else {
            toolInfo = toolsUsed[0];
        }
        console.log(
            `  Call #${i + 1}: ${type.padEnd(12)} | Input tokens: ${String(inputTokens).padEnd(6)} | Tools: ${toolInfo}`
        );
    }
    console.log(`Total Input Tokens: ${accumulatedTokens}`);
    console.log(""); // blank line separator
}

async function promptAutoSave() {
    const answer = await ask(
        colorize("Auto-save chat history every turn? (y/n): ", C.system)
    );
    const clean = answer.trim().toLowerCase();
    if (clean === "y" || clean === "yes") {
        SessionContext.autoSave = true;
        console.log(colorize("[Chat History] Auto-save enabled - session will be saved after every turn.", C.success));
    } else if (clean === "n" || clean === "no") {
        SessionContext.autoSave = false;
        console.log(colorize("[Chat History] Auto-save disabled. Use /save to save manually.", C.dim));
    } else {
        // Default to asking per-turn (legacy behavior)
        SessionContext.autoSave = null;
        console.log(colorize("[Chat History] You'll be prompted to save after each turn.", C.dim));
    }
}

const KNOWN_COMMANDS = [
    "/plan",
    "/agent",
    "/exit",
    "/save",
    "/clear",
    "/status",
    "/verbose",
    "/footer",
    "/audit",
    "/help",
    "/skills",
    "/new",
    "/load",
    "/title",
    "/rag status",
    "/rag clean",
    "/rag reindex",
    "/rag mode",
    "/rag search",
];

function levenshtein(s1, s2) {
    const track = Array(s2.length + 1).fill(null).map(() =>
        Array(s1.length + 1).fill(null));
    for (let i = 0; i <= s1.length; i += 1) {
        track[0][i] = i;
    }
    for (let j = 0; j <= s2.length; j += 1) {
        track[j][0] = j;
    }
    for (let j = 1; j <= s2.length; j += 1) {
        for (let i = 1; i <= s1.length; i += 1) {
            const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
            track[j][i] = Math.min(
                track[j][i - 1] + 1, // deletion
                track[j - 1][i] + 1, // insertion
                track[j - 1][i - 1] + indicator // substitution
            );
        }
    }
    return track[s2.length][s1.length];
}

function findClosestCommand(cmd) {
    let bestCmd = null;
    let minDistance = Infinity;
    for (const known of KNOWN_COMMANDS) {
        const dist = levenshtein(cmd, known);
        if (dist < minDistance) {
            minDistance = dist;
            bestCmd = known;
        }
    }
    return { bestCmd, distance: minDistance };
}

function listSkills() {
    const skillsDir = SKILLS_DIR;
    if (!fs.existsSync(skillsDir)) {
        console.log(colorize("  No skills directory found.", C.dim));
        return;
    }

    console.log("");
    console.log(colorize("  Available Domain Skills (docs/skills/):", C.heading));

    try {
        const subdirs = fs.readdirSync(skillsDir);
        for (const dir of subdirs) {
            const fullDir = path.join(skillsDir, dir);
            if (fs.statSync(fullDir).isDirectory()) {
                const skillFile = path.join(fullDir, "SKILL.md");
                if (fs.existsSync(skillFile)) {
                    console.log(`  - ${colorize(dir, C.system)} (${path.relative(process.cwd(), skillFile)})`);
                }
            }
        }
    } catch (e) {
        console.log(colorize(`  Error reading skills: ${e.message}`, C.error));
    }
    console.log("");
}

async function showOnboardingWizard() {
    const welcomeFile = path.join(os.homedir(), ".deepseek-cli-welcomed");
    if (fs.existsSync(welcomeFile)) {
        return; // Already welcomed
    }

    const W = 60;
    console.log(colorize("\n" + "╔" + "═".repeat(W - 2) + "╗", C.border));
    console.log(colorize("║" + " ".repeat(10) + "🚀 Welcome to DeepSeek Agentic CLI! 🚀" + " ".repeat(W - 50) + "║", C.heading));
    console.log(colorize("╚" + "═".repeat(W - 2) + "╝", C.border));
    console.log(colorize("\nLet's get you set up with a quick 10-second tour:", C.system));
    console.log("");
    console.log(`1. ${colorize("Plan Mode (/plan)", C.tool)}: Safe exploratory mode. File writes and terminal execution are restricted (writes to artifacts/ are allowed). Great for reviewing tasks first.`);
    console.log(`2. ${colorize("Agent Mode (/agent)", C.tool)}: Full autonomous execution. The agent can read, write, patch files, and execute terminal commands.`);
    console.log(`3. ${colorize("Domain Skills", C.tool)}: Place domain-specific rules (like docker, uiux, fullstack) as SKILL.md under docs/skills/ to guide agent decisions.`);
    console.log(`4. ${colorize("Slash Commands", C.tool)}: Type /help anytime to see available commands like /status, /audit, /footer, or /verbose.`);
    console.log("");

    await ask(colorize("Press [Enter] to start your first session... ", C.consent));
    console.log("");

    try {
        fs.writeFileSync(welcomeFile, "welcomed", "utf-8");
    } catch (_) {
        // ignore write failure
    }
}

// Returns true if the input was a command (handled), false otherwise.
async function handleSlashCommand(trimmed, model_name, messages, token_estimates, thinking, iterationCalls) {
    // Check for unambiguous prefix matching
    const matches = KNOWN_COMMANDS.filter(c => c.startsWith(trimmed));
    if (matches.length === 1) {
        const expanded = matches[0];
        if (expanded !== trimmed) {
            console.log(colorize(`[Command] Auto-expanded '${trimmed}' to '${expanded}'`, C.system));
            trimmed = expanded;
        }
    } else if (matches.length > 1) {
        console.log(colorize(`Ambiguous command prefix '${trimmed}'. Did you mean: ${matches.join(", ")}?`, C.warning));
        return true;
    }

    // RAG admin commands (multi-word slash commands; dispatched before the switch).
    if (
        trimmed === "/rag status" || trimmed === "/rag clean" || trimmed === "/rag reindex"
        || trimmed === "/rag mode" || trimmed.startsWith("/rag mode ")
        || trimmed.startsWith("/rag search")
    ) {
        const sub = trimmed.slice(5).trim(); // everything after "/rag "
        if (sub === "status") {
            ragStatusCmd();
        } else if (sub === "clean") {
            ragCleanCmd();
        } else if (sub === "reindex") {
            ragReindexCmd();
        } else if (sub === "mode" || sub.startsWith("mode ")) {
            const modeArg = sub.slice(4).trim();
            const parsed = parseRagMode(modeArg);
            if (!parsed.ok) {
                console.log(colorize(`  ${parsed.error}`, C.warning));
            } else {
                SessionContext.ragMode = parsed.mode;
                console.log(colorize(`  [RAG] Mode set to "${parsed.mode}". ${parsed.mode === "off" ? "rag_search tool disabled." : ""}`, C.success));
            }
        } else if (sub.startsWith("search")) {
            await ragSearchCmd(sub);
        }
        return true;
    }

    switch (trimmed) {
        case "/help": {
            printHelp();
            return true;
        }
        case "/plan": {
            SessionContext.agentMode = "plan";
            printModeSwitch("plan");
            return true;
        }
        case "/agent": {
            SessionContext.agentMode = "agent";
            printModeSwitch("agent");
            return true;
        }
        case "/clear": {
            console.clear();
            return true;
        }
        case "/save": {
            return "save";
        }
        case "/status": {
            await printStatus(model_name, messages, token_estimates, thinking);
            return true;
        }
        case "/audit": {
            printAudit(model_name, token_estimates, messages);
            return true;
        }
        case "/skills": {
            listSkills();
            return true;
        }
        case "/verbose": {
            SessionContext.verbose = !SessionContext.verbose;
            console.log(colorize(
                `[Verbose] Telemetry ${SessionContext.verbose ? "ON" : "OFF"}.`,
                SessionContext.verbose ? C.success : C.dim
            ));
            return true;
        }
        case "/footer": {
            SessionContext.showTokenFooter = !SessionContext.showTokenFooter;
            console.log(colorize(
                `[Footer] Token usage footer ${SessionContext.showTokenFooter ? "ON" : "OFF"} (default off).`,
                SessionContext.showTokenFooter ? C.success : C.dim
            ));
            return true;
        }
        case "/exit": {
            return "exit";
        }
        case "/new": {
            return "new";
        }
        case "/load": {
            return "load";
        }
        default: {
            if (trimmed.startsWith("/")) {
                const { bestCmd, distance } = findClosestCommand(trimmed);
                if (bestCmd && distance <= 3) {
                    console.log(colorize(`Unknown command: ${trimmed}. Did you mean ${bestCmd}?`, C.warning));
                } else {
                    console.log(colorize(`Unknown command: ${trimmed}. Type /help for available commands.`, C.warning));
                }
                return true;
            }
            return false;
        }
    }
}

function getUserPrompt() {
    const titleTag = SessionContext.chatTitle
        ? colorize(`[${SessionContext.chatTitle}] `, C.dim)
        : "";
    if (SessionContext.firstTurn) {
        SessionContext.firstTurn = false;
        return `${titleTag}${colorize("Enter your message (type /help for commands, 'exit' or '/exit' to quit):\n", C.user)}`;
    }
    return `${titleTag}${colorize("You > ", C.user)}`;
}

// ---------------------------------------------------------------------------
// Chat Title Generation - fires once per session from the first user message.
// Uses a lightweight LLM call to produce a concise ≤15-token intent summary.
// Runs in the background; if not ready when first save hits, falls back to
// extracting the core noun-phrase from the first user message.
// ---------------------------------------------------------------------------
async function generateChatTitle(userMessage, modelName) {
    try {
        const response = await client.chat.completions.create({
            model: modelName,
            messages: [
                {
                    role: "system",
                    content:
                        "Generate a concise, intent-summary title (max 15 tokens, keep it short like " +
                        "'fix login bug' or 'add dark mode') for the user's first message. " +
                        "Return ONLY the short title — no prefix, no quotes, no punctuation.",
                },
                { role: "user", content: userMessage },
            ],
            max_tokens: 20,
            stream: false,
        });

        const raw = response.choices?.[0]?.message?.content?.trim() || "";
        const title = sanitizeFilename(raw, 40);
        if (title) return title;
    } catch {
        // Silently fall back to noun-phrase extraction
    }

    // Fallback: extract core noun-phrase from user message
    const cleaned = stripPromptInjections(userMessage);
    // Take first sentence/clause before comma, semicolon, or question mark
    const firstClause = cleaned.split(/[,;?]/)[0].trim();
    const truncated = firstClause.length > 40
        ? firstClause.substring(0, 40).replace(/\s+\S*$/, "")
        : firstClause;
    return sanitizeFilename(truncated, 40) || "untitled";
}

// ---------------------------------------------------------------------------
// Iteration Guard - prompts the user when the inner tool-execution loop
// exceeds the configured iteration_limit. Prevents unbounded diagnostic
// spirals (see artifacts/token-waste-analysis.md, root cause #1).
// ---------------------------------------------------------------------------
async function promptIterationGuard(currentIter, limit) {
    const W = 60;
    const sep = colorize("─".repeat(W), C.border);
    console.log("");
    console.log(sep);
    console.log(colorize(
        `  [Iteration Guard] Agent has used ${currentIter}/${limit} iterations on this task.`,
        C.warning
    ));
    console.log(sep);

    const choice = await ask(
        colorize(
            "  (Y) Continue  (N) Abort  (P) Switch to Plan Mode\n  > ",
            C.consent
        )
    );
    const clean = choice.trim().toLowerCase();

    if (clean === "n" || clean === "no") {
        console.log(colorize("  [Guard] Aborting current task. You can give a new instruction.", C.system));
        return { action: "abort" };
    }
    if (clean === "p" || clean === "plan") {
        console.log(colorize("  [Guard] Switching to Plan Mode and continuing.", C.system));
        return { action: "plan" };
    }
    // Default: Y / yes / empty → continue
    const newLimit = limit + HYPERPARAMETERS.iteration_continue_budget;
    console.log(colorize(
        `  [Guard] Continuing - budget extended to ${newLimit} iterations.`,
        C.system
    ));
    return { action: "continue" };
}

// ---------------------------------------------------------------------------
// Session Memory Helper Functions
// ---------------------------------------------------------------------------
function getSessionMemoryContent() {
    if (!SessionContext.sessionMemory) return "";
    const memory = SessionContext.sessionMemory;
    const filesCreatedArr = Array.from(memory.filesCreated).map(f => path.relative(process.cwd(), f)).sort();
    const filesModifiedArr = Array.from(memory.filesModified)
        .map(f => path.relative(process.cwd(), f))
        .filter(f => !filesCreatedArr.includes(f))
        .sort();

    if (filesCreatedArr.length === 0 && filesModifiedArr.length === 0 && memory.userPreferences.length === 0 && memory.keyDecisions.length === 0) {
        return "";
    }

    return [
        "## Session Memory (State & Decisions)",
        `- **Files Created**: ${filesCreatedArr.length > 0 ? filesCreatedArr.join(", ") : "None"}`,
        `- **Files Modified**: ${filesModifiedArr.length > 0 ? filesModifiedArr.join(", ") : "None"}`,
        `- **User Preferences**: ${memory.userPreferences.length > 0 ? memory.userPreferences.join(" | ") : "None"}`,
        `- **Key Decisions**: ${memory.keyDecisions.length > 0 ? memory.keyDecisions.map(d => `\n  - ${d}`).join("") : "None"}`
    ].join("\n");
}

function getActiveMessages(messages) {
    const memoryContent = getSessionMemoryContent();
    if (!memoryContent) return messages;
    return [...messages, { role: "system", content: memoryContent }];
}

function updateSessionMemoryFromTools(tool_calls, messages) {
    if (!SessionContext.sessionMemory) {
        SessionContext.sessionMemory = {
            filesCreated: new Set(),
            filesModified: new Set(),
            userPreferences: [],
            keyDecisions: [],
        };
    }

    for (const tc of tool_calls) {
        const name = tc.function.name;
        const toolResultMsg = messages.find(m => m.role === "tool" && m.tool_call_id === tc.id);
        if (!toolResultMsg) continue;

        let resultData;
        try {
            resultData = JSON.parse(toolResultMsg.content);
        } catch (e) {
            continue;
        }

        if (resultData?.error) continue;

        if (name === "write_or_create_file") {
            const filePath = resultData.file_path;
            if (filePath) {
                const absolutePath = path.resolve(filePath);
                if (resultData.created || resultData.mode !== "line_range") {
                    if (!fs.existsSync(absolutePath)) {
                        SessionContext.sessionMemory.filesCreated.add(absolutePath);
                    } else {
                        SessionContext.sessionMemory.filesModified.add(absolutePath);
                    }
                } else {
                    SessionContext.sessionMemory.filesModified.add(absolutePath);
                }
            }
        } else if (name === "patch_file") {
            const filePath = resultData.file_path;
            if (filePath) {
                SessionContext.sessionMemory.filesModified.add(path.resolve(filePath));
            }
        } else if (name === "ask_user_preferences") {
            const pref = resultData.preference;
            if (pref) {
                SessionContext.sessionMemory.userPreferences.push(pref);
            }
        } else if (name === "delegate_sub_agents") {
            if (Array.isArray(resultData)) {
                for (const subAgentRes of resultData) {
                    const summary = subAgentRes.structured_summary;
                    if (summary) {
                        if (Array.isArray(summary.files_created)) {
                            summary.files_created.forEach(f => SessionContext.sessionMemory.filesCreated.add(path.resolve(f)));
                        }
                        if (Array.isArray(summary.files_modified)) {
                            summary.files_modified.forEach(f => SessionContext.sessionMemory.filesModified.add(path.resolve(f)));
                        }
                        if (Array.isArray(summary.key_decisions)) {
                            summary.key_decisions.forEach(d => {
                                if (!SessionContext.sessionMemory.keyDecisions.includes(d)) {
                                    SessionContext.sessionMemory.keyDecisions.push(d);
                                }
                            });
                        }
                    }
                }
            }
        }
    }
}

export function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


/**
 * Removes runtime-injected prefixes from a stored/displayed user message:
 * the mode prefix ("You are in Plan Mode. ") and, if present, the exact
 * working-directory fragment ("Working directory: D:\... . ").
 * Exact-matching on USER_WORKING_DIR makes this immune to dots/backslashes
 * inside Windows paths.
 */
function stripPromptInjections(content) {
    if (typeof content !== "string") return content;
    let cleaned = content.replace(/^You are in (Plan|Agent) Mode\.\s*/i, "");
    cleaned = cleaned.replace(new RegExp(`^Working directory: ${escapeRegExp(USER_WORKING_DIR)}\\.\\s*`), "");
    return cleaned;
}

function printLoadedMessages(messages) {
    console.clear();
    const mdRenderer = new MarkdownRenderer();
    for (const msg of messages) {
        if (msg.role === "user") {
            const cleanContent = stripPromptInjections(msg.content);
            console.log(colorize("\nYou > ", C.user) + cleanContent);
        } else if (msg.role === "assistant" && msg.content) {
            mdRenderer.reset();
            const formatted = mdRenderer.process(msg.content) + mdRenderer.flush();
            console.log(colorize("\nOrchestrator:", C.heading));
            process.stdout.write(formatted);
        }
    }
    console.log("");
}

async function multiTurnLoop(model_name) {
    let stop = false;
    let reasoning_history = "";
    let messages = [
        { role: "system", content: HYPERPARAMETERS.system_prompt },
    ];
    SessionContext.sessionMemory = {
        filesCreated: new Set(),
        filesModified: new Set(),
        userPreferences: [],
        keyDecisions: [],
    };
    // Dynamic tool list: rag_search is removed entirely in RAG 'off' mode so
    // the model can never auto-invoke it (conserves CPU / prevents ONNX spins).
    // Recomputed each turn so /rag mode changes apply immediately.
    const getAvailableTools = () => {
        const schemas = Object.values(ORCHESTRATOR_TOOLS).map(
            ([schema]) => schema
        );
        if (SessionContext.ragMode === "off") {
            return schemas.filter((s) => s?.function?.name !== "rag_search");
        }
        return schemas;
    };
    let available_tools = getAvailableTools();
    const thinking = HYPERPARAMETERS.extra_body;

    const { ask: askWithHistory, addToHistory, close: closePrompt, pause: pausePrompt } = createPromptLoop();

    while (!stop) {
        clearReadOnlyCache();
        available_tools = getAvailableTools();
        const iterationCalls = [];

        // Context Window: sliding-window oldest-message deletion
        // Deletes from index 1 (after system prompt) and always stops at a "user" role
        // boundary, ensuring atomic tool_call ↔ tool_result pairs are never orphaned
        // and `callModel` always receives a valid message array.
        let token_estimates = estimateTokens(
            getActiveMessages(messages),
            reasoning_history,
            HYPERPARAMETERS.token_multiplier
        );
        let deleted_count = 0;
        while (
            token_estimates.total_tokens >
            HYPERPARAMETERS.token_limit * 0.8 &&
            messages.length > 3
        ) {
            messages.splice(1, 1);
            deleted_count++;

            while (messages.length > 1 && messages[1]?.role !== "user") {
                messages.splice(1, 1);
                deleted_count++;
            }

            token_estimates = estimateTokens(
                getActiveMessages(messages),
                reasoning_history,
                HYPERPARAMETERS.token_multiplier
            );
        }
        if (deleted_count > 0) {
            console.log(
                colorize(`[Context Window] Deleted ${deleted_count} oldest message(s) to stay within token limit.`, C.warning)
            );
        }

        if (SessionContext.verbose) {
            console.log(
                `System:\n-Input Tokens: ${token_estimates.input_tokens}.\n` +
                `-Output Tokens: ${token_estimates.output_tokens}\n` +
                `-Total Tokens: ${token_estimates.total_tokens}.`
            );
        }
        printCompactTokens(token_estimates);

        const user_input = await askWithHistory(getUserPrompt());
        addToHistory(user_input);
        if (SessionContext.showTokenFooter) printTokenFooter(token_estimates);

        const trimmedInput = user_input.trim().toLowerCase();
        ragMessagesRef = messages; // keep RAG budget estimator in sync with conversation
        if (trimmedInput === "exit" || trimmedInput === "/exit") {
            await ragShutdown(); // stop watcher + close LanceDB before exit
            stop = true;
            if (SessionContext.autoSave === true) {
                console.log(colorize("[Chat History] Already saved by auto-save this turn.", C.dim));
            } else if (SessionContext.autoSave === false) {
                await pausePrompt();
                const saveChoice = await ask(
                    colorize("Save session before exit? (y/n): ", C.system)
                );
                if (saveChoice.trim().toLowerCase() === "y" || saveChoice.trim().toLowerCase() === "yes") {
                    const ts = await saveChatHistory(messages, model_name, SessionContext.chatTitle);
                    await saveAuditHistory(ts, SessionContext.chatTitle, model_name, getAuditData(model_name, null, messages));
                } else {
                    console.log(colorize("[Chat History] Save skipped.", C.dim));
                }
            } else {
                await pausePrompt();
                let saveChoice;
                while (true) {
                    saveChoice = await ask(
                        colorize("Do you want to save current session?\n1. Yes.\n2. No:\n", C.warning)
                    );
                    const trimmed = saveChoice.trim();
                    if (trimmed === "1") {
                        const ts = await saveChatHistory(messages, model_name, SessionContext.chatTitle);
                        await saveAuditHistory(ts, SessionContext.chatTitle, model_name, getAuditData(model_name, null, messages));
                        break;
                    } else if (trimmed === "2") {
                        console.log(colorize("[Chat History] Save skipped.", C.dim));
                        break;
                    } else {
                        console.log(colorize("Invalid choice. Please enter 1 or 2.", C.warning));
                    }
                }
            }
            continue;
        }

        // Handle /title command (with argument, so handled here not in handleSlashCommand)
        if (trimmedInput === "/title" || trimmedInput.startsWith("/title ")) {
            const titleArg = user_input.replace("/title", "").trim();
            if (titleArg) {
                SessionContext.chatTitle = sanitizeFilename(titleArg, 60);
                console.log(colorize(`[Chat Title] Set to: ${SessionContext.chatTitle}`, C.success));
            } else {
                console.log(colorize(`[Chat Title] Current: ${SessionContext.chatTitle || "(not set)"}`, C.system));
                console.log(colorize(`  Usage: /title <your custom title>`, C.dim));
            }
            continue;
        }

        const commandResult = await handleSlashCommand(trimmedInput, model_name, messages, token_estimates, thinking, iterationCalls);

        if (commandResult === true) {
            continue; // command handled, no model call
        }
        if (commandResult === "save") {
            const ts = await saveChatHistory(messages, model_name, SessionContext.chatTitle);
            await saveAuditHistory(ts, SessionContext.chatTitle, model_name, getAuditData(model_name, null, messages));
            await copyActiveToHistory(SessionContext.chatTitle || "autosave");
            continue;
        }
        if (commandResult === "exit") {
            // /exit was handled in handleSlashCommand — the exit-save flow already
            // ran above when trimmedInput === "/exit". This is a safety net, but
            // the actual exit handling is done at lines 900-936.
            stop = true;
            continue;
        }
        if (commandResult === "new") {
            // Shutdown then restart RAG so the fresh conversation keeps retrieval.
            await ragShutdown();
            ragInit();
            if (messages.length > 1) {
                if (SessionContext.autoSave === false || SessionContext.autoSave === null) {
                    await pausePrompt();
                    const saveChoice = await ask(
                        colorize("Save current session before starting a new one? (y/n): ", C.system)
                    );
                    if (saveChoice.trim().toLowerCase() === "y" || saveChoice.trim().toLowerCase() === "yes") {
                        const ts = await saveChatHistory(messages, model_name, SessionContext.chatTitle);
                        await saveAuditHistory(ts, SessionContext.chatTitle, model_name, getAuditData(model_name, null, messages));
                    }
                }
            }
            messages = [
                { role: "system", content: HYPERPARAMETERS.system_prompt },
            ];
            reasoning_history = "";
            SessionContext.firstTurn = true;
            SessionContext.workDirInjected = false; // fresh conversation → re-inject working dir on next prompt
            SessionContext.chatTitle = null;
            SessionContext.messageCount = 0;
            SessionContext.accumulatedInputTokens = 0;
            SessionContext.accumulatedOutputTokens = 0;
            SessionContext.orchestratorInputTokens = 0;
            SessionContext.turnAuditTrail = [];
            SessionContext.currentTurnSubAgents = [];
            SessionContext.turnCounter = 0;
            SessionContext.sessionMemory = {
                filesCreated: new Set(),
                filesModified: new Set(),
                userPreferences: [],
                keyDecisions: [],
            };
            console.log(colorize("\n✨ Started a new conversation. Chat history and memory have been cleared.\n", C.success));
            continue;
        }
        if (commandResult === "load") {
            await pausePrompt();
            
            const chatDir = path.join(REPO_ROOT, "chat_history");
            const files = findChatFiles(chatDir);
            const chatHistories = [];

            for (const filePath of files) {
                try {
                    const stats = fs.statSync(filePath);
                    const content = fs.readFileSync(filePath, "utf-8");
                    const payload = JSON.parse(content);
                    
                    if (!payload || !Array.isArray(payload.messages)) continue;
                    
                    const pathParts = filePath.split(path.sep);
                    const dateFolder = pathParts[pathParts.length - 2];
                    const filename = pathParts[pathParts.length - 1];
                    
                    let date = stats.mtime;
                    let title = "";
                    
                    const dateMatch = dateFolder.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
                    const fileMatch = filename.match(/^(\d{2})\.(\d{2})\.(\d{2})(?:\s*-\s*(.*))?\.json$/);
                    
                    if (dateMatch && fileMatch) {
                        const day = parseInt(dateMatch[1], 10);
                        const month = parseInt(dateMatch[2], 10);
                        const year = parseInt(dateMatch[3], 10);
                        const hour = parseInt(fileMatch[1], 10);
                        const minute = parseInt(fileMatch[2], 10);
                        const second = parseInt(fileMatch[3], 10);
                        
                        date = new Date(year, month - 1, day, hour, minute, second);
                        title = fileMatch[4] || "";
                    } else {
                        title = filename.replace(/\.json$/, "");
                    }
                    
                    if (!title) {
                        const firstUser = payload.messages.find(m => m.role === "user");
                        if (firstUser) {
                            title = stripPromptInjections(firstUser.content);
                            if (title.length > 60) title = title.substring(0, 57) + "...";
                        } else {
                            title = "Untitled Conversation";
                        }
                    }
                    
                    chatHistories.push({
                        filePath,
                        date,
                        title,
                        messageCount: payload.messages.length,
                        messages: payload.messages,
                        savedAt: payload.saved_at ? new Date(payload.saved_at) : date
                    });
                } catch (err) {
                    // skip malformed
                }
            }

            // Group by title (case-insensitive)
            const groups = {};
            for (const item of chatHistories) {
                const key = item.title.toLowerCase().trim();
                if (!groups[key]) {
                    groups[key] = {
                        title: item.title,
                        versions: []
                    };
                }
                groups[key].versions.push(item);
            }

            const allConversations = Object.values(groups).map(group => {
                group.versions.sort((a, b) => b.savedAt - a.savedAt);
                return {
                    title: group.title,
                    latestVersion: group.versions[0],
                    versionsCount: group.versions.length,
                    versions: group.versions
                };
            });

            // Sort all by most recent (latest version saved date)
            allConversations.sort((a, b) => b.latestVersion.savedAt - a.latestVersion.savedAt);

            let currentConversations = [...allConversations];
            let currentPage = 1;
            const itemsPerPage = 5;
            let loadedSuccessfully = false;
            let menuIndex = 0;

            while (!loadedSuccessfully) {
                const totalItems = currentConversations.length;
                const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
                
                if (currentPage > totalPages) currentPage = totalPages;
                if (currentPage < 1) currentPage = 1;

                const startIndex = (currentPage - 1) * itemsPerPage;
                const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
                const pageItems = currentConversations.slice(startIndex, endIndex);

                const titlePrefix = currentConversations === allConversations ? "Recent Conversations" : "Search Results";
                const menuTitle = colorize(`  ${titlePrefix} (Page ${currentPage} of ${totalPages}):`, C.heading);

                const menuOptions = [];
                menuOptions.push({
                    label: "🔍 Search conversations...",
                    value: { type: "search" }
                });

                pageItems.forEach((convo) => {
                    const latest = convo.latestVersion;
                    const dateStr = latest.savedAt.toLocaleString();
                    const verStr = convo.versionsCount > 1 ? ` (${convo.versionsCount} versions)` : "";
                    menuOptions.push({
                        label: convo.title,
                        description: `Latest: ${dateStr} | Messages: ${latest.messageCount}${verStr}`,
                        value: { type: "convo", convo }
                    });
                });

                if (currentPage < totalPages) {
                    menuOptions.push({
                        label: `➡️  Next Page (${currentPage + 1}/${totalPages})`,
                        value: { type: "next" }
                    });
                }
                if (currentPage > 1) {
                    menuOptions.push({
                        label: `⬅️  Previous Page (${currentPage - 1}/${totalPages})`,
                        value: { type: "prev" }
                    });
                }

                menuOptions.push({
                    label: "❌ Cancel",
                    value: { type: "cancel" }
                });

                if (menuIndex >= menuOptions.length) {
                    menuIndex = menuOptions.length - 1;
                }

                const selected = await selectFromList(menuTitle, menuOptions, menuIndex);

                if (selected === null || selected.type === "cancel") {
                    console.log(colorize("  Load cancelled.\n", C.dim));
                    break;
                }

                if (selected && selected.type === "keyAction") {
                    if (selected.action === "left" && currentPage > 1) {
                        currentPage--;
                        menuIndex = 0;
                    } else if (selected.action === "right" && currentPage < totalPages) {
                        currentPage++;
                        menuIndex = 0;
                    }
                    continue;
                }

                if (selected.type === "next") {
                    currentPage++;
                    menuIndex = 0;
                    continue;
                }

                if (selected.type === "prev") {
                    currentPage--;
                    menuIndex = 0;
                    continue;
                }

                if (selected.type === "search") {
                    console.log("");
                    const keyword = await askSearchKeyword(
                        colorize("  Enter keyword to search (Ctrl+C to cancel): ", C.consent)
                    );

                    if (keyword === null) {
                        console.log(colorize("\n  Search cancelled. Returning to list...\n", C.dim));
                        continue;
                    }

                    const trimmedKeyword = keyword.trim();
                    if (!trimmedKeyword) {
                        currentConversations = [...allConversations];
                        currentPage = 1;
                        menuIndex = 0;
                        console.log(colorize("  Showing all conversations.\n", C.dim));
                        continue;
                    }

                    const escaped = escapeRegExp(trimmedKeyword);
                    const regex = new RegExp('\\b' + escaped + '\\b', 'i');

                    currentConversations = allConversations.filter(convo => {
                        return convo.versions.some(ver => {
                            return ver.messages.some(msg => {
                                if (msg.role !== "user" && msg.role !== "assistant") return false;
                                if (!msg.content || typeof msg.content !== "string") return false;
                                return regex.test(msg.content);
                            });
                        });
                    });

                    currentPage = 1;
                    menuIndex = 0;
                    console.log(colorize(`\n  Found ${currentConversations.length} matching conversations.\n`, C.success));
                    continue;
                }

                if (selected.type === "convo") {
                    const selectedConvo = selected.convo;
                    let chosenVersion = selectedConvo.latestVersion;

                    if (selectedConvo.versionsCount > 1) {
                        const versionOptions = [];
                        selectedConvo.versions.forEach((ver, vIndex) => {
                            const label = vIndex === 0 ? " (Latest)" : "";
                            versionOptions.push({
                                label: `${ver.savedAt.toLocaleString()} - ${ver.messageCount} messages${label}`,
                                value: ver
                            });
                        });
                        versionOptions.push({
                            label: "❌ Cancel version selection",
                            value: null
                        });

                        const versionTitle = colorize(`  Select a version of "${selectedConvo.title}" to load:`, C.heading);
                        chosenVersion = await selectFromList(versionTitle, versionOptions, 0);
                    }

                    if (chosenVersion === null) {
                        menuIndex = menuOptions.findIndex(opt => opt.value && opt.value.convo === selectedConvo);
                        continue;
                    }

                    if (chosenVersion && chosenVersion.type === "keyAction") {
                        continue;
                    }

                    if (messages.length > 1) {
                        if (SessionContext.autoSave === false || SessionContext.autoSave === null) {
                            const saveChoice = await ask(
                                colorize("Save current session before loading? (y/n): ", C.system)
                            );
                            if (saveChoice.trim().toLowerCase() === "y" || saveChoice.trim().toLowerCase() === "yes") {
                                const ts = await saveChatHistory(messages, model_name, SessionContext.chatTitle);
                                await saveAuditHistory(ts, SessionContext.chatTitle, model_name, getAuditData(model_name, null, messages));
                            }
                        }
                    }

                    messages = chosenVersion.messages;
                    reasoning_history = "";
                    SessionContext.firstTurn = false;
                    SessionContext.workDirInjected = true; // continue: never re-inject working dir into a loaded conversation
                    SessionContext.chatTitle = selectedConvo.title;
                    SessionContext.messageCount = messages.filter(m => m.role === 'user' || m.role === 'assistant').length;

                    // Rebuild session memory
                    SessionContext.sessionMemory = {
                        filesCreated: new Set(),
                        filesModified: new Set(),
                        userPreferences: [],
                        keyDecisions: [],
                    };
                    messages.forEach(msg => {
                        if (msg.role === "assistant" && msg.tool_calls) {
                            updateSessionMemoryFromTools(msg.tool_calls, messages);
                        }
                    });

                    // Clear screen and print loaded messages (using MarkdownRenderer for consistency)
                    printLoadedMessages(messages);
                    loadedSuccessfully = true;
                }
            }

            continue;
        }
        // false = not a command, proceed to model

        await pausePrompt();

        // --- RAG intent tags (@rag / @rag:keyword / @rag:exact) ---
        // Deterministic user-requested retrieval: strip the tag, run the search
        // here (keyword fast-path for @rag:keyword/@rag:exact), and inject the
        // results into the user context so the model cannot skip them.
        let ragContextBlock = null;
        const { text: cleanedInput, tag } = stripRagTag(user_input);
        const ragDecision = resolveRagSearch({ ragMode: SessionContext.ragMode, tag });
        if (tag && ragDecision.enabled && ragDecision.force) {
            try {
                const searchOut = await rag.search({
                    query: cleanedInput,
                    top_k: 5,
                    min_score: 0.30,
                    search_mode: ragDecision.search_mode,
                });
                const hits = (searchOut.results || []).map((r) => ({
                    score: typeof r.score === "number" ? r.score : null,
                    layer: r.layer ?? null,
                    namespace: r.namespace ?? null,
                    file_path: r.file_path ?? null,
                    line_start: r.line_start ?? null,
                    line_end: r.line_end ?? null,
                    text: r.text ?? "",
                }));
                ragContextBlock = hits.length
                    ? `\n[RAG SEARCH RESULTS (${ragDecision.search_mode})]\n${JSON.stringify(hits, null, 2)}\n[/RAG SEARCH RESULTS]`
                    : `\n[RAG SEARCH RESULTS (${ragDecision.search_mode})]\n(no relevant results found)\n[/RAG SEARCH RESULTS]`;
            } catch (err) {
                console.log(colorize(`[RAG] Tagged search failed: ${err?.message ?? err}`, C.warning));
            }
        } else if (tag && !ragDecision.enabled) {
            console.log(colorize("[RAG] RAG is OFF — ignoring @rag tag (run /rag mode auto|manual to re-enable).", C.warning));
        }
        const effectiveUserInput = tag ? cleanedInput : user_input;

        // Prepend current mode context so the model always knows its operating mode.
        // On the very first prompt of a conversation only, also inject the agent's
        // working directory (the directory the user launched the CLI from).
        const modeLabel = SessionContext.agentMode === "plan" ? "Plan" : "Agent";
        let prefixedInput = `You are in ${modeLabel} Mode. ${effectiveUserInput}`;
        if (!SessionContext.workDirInjected) {
            prefixedInput = `You are in ${modeLabel} Mode. Working directory: ${USER_WORKING_DIR}. ${effectiveUserInput}`;
            SessionContext.workDirInjected = true;
        }
        if (ragContextBlock) prefixedInput += ragContextBlock;
        messages.push({ role: "user", content: prefixedInput });
        SessionContext.messageCount++;

        // Generate chat title from the first real user message (fire-and-forget; non-blocking).
        // The promise settles in the background; if the first save happens before it resolves,
        // saveChatHistory falls back to title-less naming.
        if (!SessionContext.chatTitle) {
            generateChatTitle(effectiveUserInput, model_name).then((title) => {
                SessionContext.chatTitle = title;
            });
        }

        // Inner loop to handle potential back-and-forth tool executions.
        // Tracked with an iteration guard: if the model exceeds
        // HYPERPARAMETERS.iteration_limit round-trips on a single user
        // input, the user is prompted before continuing.
        let effectiveLimit = HYPERPARAMETERS.iteration_limit;
        for (let innerIter = 0; ; innerIter++) {
            // --- Iteration Guard ---
            if (innerIter >= effectiveLimit) {
                await pausePrompt();
                const guardResult = await promptIterationGuard(innerIter, effectiveLimit);
                if (guardResult.action === "abort") {
                    break;
                }
                if (guardResult.action === "plan") {
                    SessionContext.agentMode = "plan";
                    printModeSwitch("plan");
                }
                effectiveLimit += HYPERPARAMETERS.iteration_continue_budget;
            }

            let pre_call_tokens = estimateTokens(
                getActiveMessages(messages),
                reasoning_history,
                HYPERPARAMETERS.token_multiplier
            );
            const call_type = determineCallType(messages);

            const available_tokens =
                HYPERPARAMETERS.token_limit - pre_call_tokens.total_tokens;

            if (available_tokens <= 0) {
                console.log(
                    colorize("\n[Error] Context window exceeded. Please restart the conversation to continue.", C.error)
                );
                break;
            }

            const max_output_tokens = Math.min(MAX_OUTPUT_TOKENS, available_tokens);
            try {
                startSpinner("Orchestrator is thinking...");
                const stream = await callModel(
                    model_name,
                    max_output_tokens,
                    messages,
                    HYPERPARAMETERS.stream,
                    HYPERPARAMETERS.extra_body,
                    HYPERPARAMETERS.reasoning_effort,
                    available_tools
                );

                const { reasoning_content, content, tool_calls, usage } =
                    await printStreamResponse(stream, HYPERPARAMETERS.extra_body, "Orchestrator")

                const effective_call_type =
                    !tool_calls && call_type === "tool_result" ? "assistant" : call_type;
                const toolsUsed = tool_calls
                    ? tool_calls.map((tc) => tc.function?.name || "unknown")
                    : [];
                // Use actual API-reported prompt_tokens when available;
                // fall back to pre-call estimation if the API omits usage data.
                const actualInputTokens = usage?.prompt_tokens ?? pre_call_tokens.input_tokens;

                iterationCalls.push({
                    type: effective_call_type,
                    inputTokens: actualInputTokens,
                    toolCalled: !!tool_calls,
                    toolsUsed,
                    batchCall: tool_calls && tool_calls.length > 1,
                });

                SessionContext.accumulatedInputTokens += actualInputTokens;
                SessionContext.accumulatedOutputTokens += usage?.completion_tokens ?? 0;
                SessionContext.orchestratorInputTokens += actualInputTokens;

                // Optimization: Standardised Message History
                const assistant_message = {
                    role: "assistant",
                    content: content || ""
                };


                // Only push reasoning_content back into messages when thinking is
                // explicitly enabled. If disabled, storing it triggers a 400 error
                // from the DeepSeek API on subsequent calls.
                if (HYPERPARAMETERS.extra_body?.thinking?.type === "enabled") {
                    assistant_message.reasoning_content = reasoning_content || "";
                }

                if (tool_calls) assistant_message.tool_calls = tool_calls;
                messages.push(assistant_message);

                // Re-estimate tokens after adding assistant message and show footer
                const post_stream_estimates = estimateTokens(
                    getActiveMessages(messages),
                    reasoning_history,
                    HYPERPARAMETERS.token_multiplier
                );
                if (SessionContext.showTokenFooter) printTokenFooter(post_stream_estimates);

                if (tool_calls) {
                    // Pause the persistent prompt loop to avoid double-echo of
                    // keystrokes when consent tools create their own readline interfaces.
                    // Must await so the old readline interface is fully closed
                    // (including raw mode restoration) before any consent tool
                    // creates a temporary interface on the same stdin.
                    await pausePrompt();
                    try {
                        await callToolsInBatch(tool_calls, ORCHESTRATOR_TOOLS, messages, SessionContext.agentMode);
                        updateSessionMemoryFromTools(tool_calls, messages);

                        // Re-estimate and show footer after tool results are added to context
                        const post_tool_estimates = estimateTokens(
                            getActiveMessages(messages),
                            reasoning_history,
                            HYPERPARAMETERS.token_multiplier
                        );
                        if (SessionContext.showTokenFooter) printTokenFooter(post_tool_estimates);
                    } catch (e) {
                        const errMsg = `Fatal error during batch tool execution: ${e.message || e}`;
                        console.log(colorize(errMsg, C.error));
                        for (const tc of tool_calls) {
                            messages.push({
                                role: "tool",
                                tool_call_id: tc.id,

                                content: JSON.stringify({
                                    error: true,
                                    message: errMsg,
                                }),
                            });
                        }
                    }
                    continue;
                } else {
                    break;
                }
            } catch (error) {
                stopSpinner();
                // Handle the network drop gracefully without crashing the CLI
                if (error.code === 'ECONNRESET' || error.message.includes('terminated')) {
                    console.log(colorize("\n[Error] The API provider abruptly dropped the connection (ECONNRESET).", C.error));
                    console.log(colorize("        This is usually due to high server load. Please try your request again.", C.dim));
                } else {
                    console.log(colorize(`\n[Error] API call failed: ${error.message}`, C.error));
                }
                break;
            }
        }

        if (SessionContext.autoSave === true) {
            const ts = await saveChatHistory(messages, model_name, SessionContext.chatTitle);
            await saveAuditHistory(ts, SessionContext.chatTitle, model_name, getAuditData(model_name, null, messages));
            await copyActiveToHistory(SessionContext.chatTitle || "autosave");
        } else if (SessionContext.autoSave === false) {
        } else {
            await pausePrompt();
            while (true) {
                const saveChoice = await ask(
                    colorize("Do you want to save current session?\n1. Yes.\n2. No:\n", C.warning)
                );
                const trimmed = saveChoice.trim();
                if (trimmed === "1") {
                    const ts = await saveChatHistory(messages, model_name, SessionContext.chatTitle);
                    await saveAuditHistory(ts, SessionContext.chatTitle, model_name, getAuditData(model_name, null, messages));
                    break;
                } else if (trimmed === "2") {
                    console.log(colorize("[Chat History] Save skipped.", C.dim));
                    break;
                } else {
                    console.log(colorize("Invalid choice. Please enter 1 or 2.", C.warning));
                }
            }
        }

        // Archive the current turn's audit records (sub-agents + orchestrator)
        SessionContext.turnCounter++;
        const turnOrchestratorInput = SessionContext.orchestratorInputTokens;
        SessionContext.turnAuditTrail.push({
            turnNumber: SessionContext.turnCounter,
            subAgents: [...SessionContext.currentTurnSubAgents],
            orchestratorInput: turnOrchestratorInput,
        });
        SessionContext.currentTurnSubAgents = [];
        SessionContext.orchestratorInputTokens = 0;

        printIterationSummary(iterationCalls);
    }

    await closePrompt();
}

export async function runChat() {
    await showOnboardingWizard();
    const { model_name, apiKey, baseURL, provider } = await startChat();

    // Create the OpenAI client dynamically based on the selected provider
    client = new OpenAI({ apiKey, baseURL });
    activeModelConfig = { model_name, apiKey, baseURL, provider };

    // Non-blocking RAG startup: CLI stays interactive; indexing runs in background.
    ragInit();

    const extra_body = await thinkingToggle(provider);
    HYPERPARAMETERS.extra_body = extra_body;

    printSessionBanner(model_name, extra_body);

    await promptAutoSave();

    await archiveActiveToHistory("session-startup");

    await multiTurnLoop(model_name);
    process.exit(0);
}


