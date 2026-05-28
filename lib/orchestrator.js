import OpenAI from "openai";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { ask, askYesNo, startChat, thinkingToggle, createPromptLoop } from "./cliInput.js";
import { estimateTokens } from "./tokenizer.js";
import { printStreamResponse } from "./streamHandler.js";
import fs from "fs";
import { ORCHESTRATOR_TOOLS, callToolsInBatch } from "../tools/registry.js";
import { clearReadOnlyCache } from "../tools/callToolsInBatch.js";
import { saveChatHistory, saveAuditHistory, sanitizeFilename } from "./chatHistory.js";
import { archiveActiveToHistory, copyActiveToHistory } from "./artifactManager.js";
import { C, colorize } from "./colors.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.chdir(path.join(__dirname, ".."));

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
    chatTitle: null,           // LLM-generated title from first user message; reused for all saves
    messageCount: 0,           // track total user+assistant message count
    iterationCalls: [],        // per-turn telemetry records (only collected when verbose)
    accumulatedInputTokens: 0, // running tally of input tokens across all API calls
    accumulatedOutputTokens: 0, // running tally of output/completion tokens across all API calls
    orchestratorInputTokens: 0, // orchestrator input tokens to calculate cache_miss
    turnAuditTrail: [],        // [{ turnNumber, subAgents: [...] }] - per-turn sub-agent telemetry
    currentTurnSubAgents: [],  // sub-agent audit records for the current turn
    turnCounter: 0,            // incremented each new user message
};

// Mutable tools blocked in Plan Mode - unless the target path is inside
const MUTATION_BLOCKED_TOOLS = new Set([
    "patch_file",
    "write_or_create_file",
    "execute_terminal_command",
]);

export { SessionContext, MUTATION_BLOCKED_TOOLS, PRICING, getAuditData };

// Pricing per 1M tokens (USD)
const PRICING = {
    "deepseek-v4-flash": { input: 0.0028, output: 0.28, cache_miss: 0.14 },
    "deepseek-v4-pro": { input: 0.003625, output: 0.87, cache_miss: 0.435 },
};

const MAX_OUTPUT_TOKENS = 8192;

const HYPERPARAMETERS = {
    token_limit: 200000,
    token_multiplier: 1.5,
    stream: true,
    reasoning_effort: "high",
    iteration_limit: 30,
    iteration_continue_budget: 25,
    system_prompt:
        `
            ## Role
            - An expert Orchestrator for a team of Execution sub-agents.
            - You must execute yourself if you have no clear plan, or the plan shows there are little 
            (less than 5-10 files to be created/modified/deleted depending on complexity) modifications
            on the codebase.

            ## Technical Environment
            - OS: Windows
            - Terminal: PowerShell (Ensure all scripts are .ps1 compatible)

            ## Source of Truth
            - Primary: User Requirements and Preferences
            - Secondary: Industry Engineering Standards: SOLID, DRY, clean code, and maintainability
            - Tertiary: Domain-specific SKILL.md files in \`docs/skills/\` - When a user request
              involves a covered domain, you MUST read the relevant SKILL.md during Step 2 to extract domain constraints,
              principles, and anti-patterns that inform the plan.

            ## Domain Knowledge (docs/skills/)
            - The \`docs/skills/\` directory contains SKILL.md files encoding industry-standard
              principles, constraints, and anti-patterns for specific domains.
            - **When to consult:** When the user request involves a covered domain, read the
              corresponding SKILL.md. Its constraints and principles are authoritative for
              domain-specific decisions.
            - **In delegation:** When delegating to an execution sub-agent, pass the file paths to
              SKILL.md in the \`context\` field so the sub-agent applies them.

            ## Output Constraints
            - Most of the time: Keep outputs concise and technical in Markdowns.
            - Code Implementation: Use 'DRY' and 'SOLID' principles as the default architecture.
            Regarding the UI/UX, use interactive and reactive to improve user experience.

            ## Tools Usage
            - **Batch-first mandate:** Must leverage batch tool-calling to execute tools
            all-at-once. Only call sequentially if the next tool's input depends
            on the previous one's output.
            - **Similar-tool disambiguation:**
              - \`get_project_tree\` vs \`execute_terminal_command\` for exploration → always prefer \`get_project_tree\`.
              - \`patch_file\` vs \`write_or_create_file\` → prefer \`patch_file\` for edits ≤~20 lines; use \`write_or_create_file\` for new files or large rewrites.
              - \`read_file_chunk\` vs \`multi_file_search_string\` → use \`read_file_chunk\` when you know the file path; use \`multi_file_search_string\` to find where something lives.

            ## Mandatory Planning Pipeline
            **Step 1 Clarification Threshold**:
                1.1 If the user request involves high-level architectural visions, future product roadmaps,
                or open-ended documentation, you MUST ask to clarify the scope of the answer.
                1.2 If the request is a standard coding task, bug fix, or localized feature implementation
                (small tasks, facts, multiple choices), ask for preferences or clarification. Do not assume.
                You must provide options of reasonable, modern industry-standard assumptions in the choices.
            **Step 2 - Gathered Critical Resource in the codebase**:
                2.1 Primary: High-level contains that provide overall information (techstack,
                    dependencies, project structure, etc.)
                2.2 Secondary: Files that contain implementation details relevant to the user's request
                **Important Note**: Complete the task using the absolute minimum number of tool calls.
                    Exploratory or broad codebase searches are strictly prohibited.
            **Step 3 - Conduct Implementation Plan** (Only in Plan Mode)
                **Plan Template**
                The plan must include these sections and create in artifacts/active folder:
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
            **Step 4 - Proceed with Implementation** (Only in Agent Mode)
                - Only triggers when user approves the plan or user requests to proceed
                with implementation.
                - You will delegate to execution agent only after you have the plan from Step 3.
        `
};

async function callModel(
    model_name,
    token_limit,
    messages,
    stream,
    extra_body,
    reasoning_effort,
    tools = null
) {
    const kwargs = {
        model: model_name,
        messages: messages,
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
    console.log(`  ${colorize("/status", C.tool)}   - Show session info (mode, model, tokens, messages)`);
    console.log(`  ${colorize("/verbose", C.tool)}  - Toggle detailed telemetry on/off`);
    console.log(`  ${colorize("/audit", C.tool)}    - Show sub-agent token & cost breakdown with orchestrator totals`);
    console.log(`  ${colorize("/help", C.tool)}     - Show this help`);
    console.log("");
}

function printStatus(model_name, messages, token_estimates, thinking) {
    const modeLabel = SessionContext.agentMode === "plan" ? "Plan" : "Agent";
    const thinkingLabel = thinking?.reasoning_effort
        ? thinking.reasoning_effort                    // Gemini
        : (thinking?.thinking?.type === "enabled" ? "enabled" : "disabled"); // DeepSeek
    const verboseLabel = SessionContext.verbose ? "on" : "off";
    const autoSaveLabel = SessionContext.autoSave === true ? "on" : (SessionContext.autoSave === false ? "off" : "unset");
    const pctUsed = ((token_estimates.total_tokens / HYPERPARAMETERS.token_limit) * 100).toFixed(1);

    console.log("");
    console.log(colorize("  Session Status:", C.heading));
    console.log(`  Mode:       ${colorize(modeLabel, C.system)}`);
    console.log(`  Model:      ${colorize(model_name, C.system)}`);
    console.log(`  Thinking:   ${colorize(thinkingLabel, C.system)}`);
    console.log(`  Messages:   ${colorize(String(messages.length - 1), C.system)} (excl. system prompt)`);
    console.log(`  Tokens:     ${colorize(`${token_estimates.total_tokens.toLocaleString()} / ${HYPERPARAMETERS.token_limit.toLocaleString()} (${pctUsed}%)`, C.system)}`);
    console.log(`  Acc. input: ${colorize(SessionContext.accumulatedInputTokens.toLocaleString() + " tokens", C.system)}`);

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

function getAuditData(model_name, token_estimates = null) {
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
    // (accInput × input_rate) + (accOutput × output_rate) + (token_estimates.input_tokens × cache_miss_rate)
    // When token_estimates is not provided (save paths), fall back to orchestratorInputTokens.
    const cacheMissTokens = token_estimates
        ? token_estimates.input_tokens
        : SessionContext.orchestratorInputTokens;
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
            tokenEstimates: token_estimates ? {
                input_tokens: token_estimates.input_tokens,
                output_tokens: token_estimates.output_tokens,
                total_tokens: token_estimates.total_tokens,
            } : null,
        },
        grandTotal: {
            inputTokens: grandInput,
            outputTokens: grandOutput,
            estimatedCost: grandCost,
        },
    };
}

function printAudit(model_name, token_estimates = null) {
    const data = getAuditData(model_name, token_estimates);

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

    if (allSubAgents.length === 0 && data.turns.length === 0 && !data.currentTurn) {
        console.log(colorize("║  No sub-agents have been spawned yet in this session.              ║", C.dim));
        console.log(colorize("╚" + "═".repeat(100) + "╝", C.border));
        console.log("");
        return;
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
        const header = "  Role                   Msgs   Input Tokens    Output Tokens   Accum. Tokens   Est. Cost";
        console.log(colorize(header, C.system));

        for (const sa of turn.subAgents) {
            const roleLabel = (sa.type || sa.name || "unknown");
            const role = roleLabel.length > 22 ? roleLabel.substring(0, 19) + "..." : roleLabel.padEnd(22);
            const msgs = String(sa.messages).padStart(5);
            const inp = sa.inputTokens.toLocaleString().padStart(14);
            const out = sa.outputTokens.toLocaleString().padStart(14);
            const acc = sa.accumulatedInputTokens.toLocaleString().padStart(14);
            const cost = "$" + sa.estimatedCost.toFixed(4);

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

        const header = "  Role                   Msgs   Input Tokens    Output Tokens   Accum. Tokens   Est. Cost";
        console.log(colorize(header, C.system));

        for (const sa of turn.subAgents) {
            const roleLabel = (sa.type || sa.name || "unknown");
            const role = roleLabel.length > 22 ? roleLabel.substring(0, 19) + "..." : roleLabel.padEnd(22);
            const msgs = String(sa.messages).padStart(5);
            const inp = sa.inputTokens.toLocaleString().padStart(14);
            const out = sa.outputTokens.toLocaleString().padStart(14);
            const acc = sa.accumulatedInputTokens.toLocaleString().padStart(14);
            const cost = "$" + sa.estimatedCost.toFixed(4);

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
        `  Input: ${data.grandTotal.inputTokens.toLocaleString()} tokens  |  Output: ${data.grandTotal.outputTokens.toLocaleString()} tokens  |  Est. Cost: $${data.grandTotal.estimatedCost.toFixed(4)}`,
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

// Returns true if the input was a command (handled), false otherwise.
function handleSlashCommand(trimmed, model_name, messages, token_estimates, thinking, iterationCalls) {
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
            printStatus(model_name, messages, token_estimates, thinking);
            return true;
        }
        case "/audit": {
            printAudit(model_name, token_estimates);
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
        default: {
            if (trimmed.startsWith("/")) {
                console.log(colorize(`Unknown command: ${trimmed}. Type /help for available commands.`, C.warning));
                return true;
            }
            return false;
        }
    }
}

function getUserPrompt() {
    if (SessionContext.firstTurn) {
        SessionContext.firstTurn = false;
        return colorize("Enter your message (type /help for commands, 'exit' to quit):\n", C.user);
    }
    return colorize("You > ", C.user);
}

// ---------------------------------------------------------------------------
// Chat Title Generation - fires once per session from the first user message.
// Uses a lightweight LLM call to produce a ≤60-char filename-safe title.
// Runs in the background; if not ready when first save hits, falls back to
// a truncated version of the first user message.
// ---------------------------------------------------------------------------
async function generateChatTitle(userMessage, modelName) {
    try {
        const response = await client.chat.completions.create({
            model: modelName,
            messages: [
                {
                    role: "system",
                    content:
                        "Generate a short, descriptive title (max 60 characters, lowercase with hyphens, " +
                        "no quotes, no punctuation at the end) for a chat conversation based on the user's " +
                        "first message intent. Return ONLY the title, nothing else - no prefix, no explanation.",
                },
                { role: "user", content: userMessage },
            ],
            max_tokens: 45,
            stream: false,
        });

        const raw = response.choices?.[0]?.message?.content?.trim() || "";
        const title = sanitizeFilename(raw, 60);
        if (title) return title;
    } catch {
        // Silently fall back to truncated input
    }

    // Fallback: truncate + sanitize the raw user message
    const truncated = userMessage.length > 60
        ? userMessage.substring(0, 60).replace(/\s+\S*$/, "")
        : userMessage;
    return sanitizeFilename(truncated, 60) || "untitled";
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
function updateSystemPrompt(messages) {
    if (!SessionContext.sessionMemory) return;
    const memory = SessionContext.sessionMemory;
    const memoryLines = [
        "",
        "## Session Memory (State & Decisions)",
        `- **Files Created**: ${memory.filesCreated.size > 0 ? Array.from(memory.filesCreated).map(f => path.relative(process.cwd(), f)).join(", ") : "None"}`,
        `- **Files Modified**: ${memory.filesModified.size > 0 ? Array.from(memory.filesModified).map(f => path.relative(process.cwd(), f)).join(", ") : "None"}`,
        `- **User Preferences**: ${memory.userPreferences.length > 0 ? memory.userPreferences.join(" | ") : "None"}`,
        `- **Key Decisions**: ${memory.keyDecisions.length > 0 ? memory.keyDecisions.map(d => `\n  - ${d}`).join("") : "None"}`
    ].join("\n");

    messages[0].content = HYPERPARAMETERS.system_prompt + "\n" + memoryLines;
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

    updateSystemPrompt(messages);
}

async function multiTurnLoop(model_name) {
    let stop = false;
    let reasoning_history = "";
    const messages = [
        { role: "system", content: HYPERPARAMETERS.system_prompt },
    ];
    SessionContext.sessionMemory = {
        filesCreated: new Set(),
        filesModified: new Set(),
        userPreferences: [],
        keyDecisions: [],
    };
    const available_tools = Object.values(ORCHESTRATOR_TOOLS).map(
        ([schema]) => schema
    );
    const thinking = HYPERPARAMETERS.extra_body;

    const { ask: askWithHistory, addToHistory, close: closePrompt, pause: pausePrompt } = createPromptLoop();

    while (!stop) {
        clearReadOnlyCache();
        const iterationCalls = [];

        // Optimization: Sliding Context Window
        let token_estimates = estimateTokens(
            messages,
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
                messages,
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

        if (user_input.toLowerCase() === "exit") {
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
                    await saveAuditHistory(ts, SessionContext.chatTitle, model_name, getAuditData(model_name));
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
                        await saveAuditHistory(ts, SessionContext.chatTitle, model_name, getAuditData(model_name));
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

        const trimmed = user_input.trim().toLowerCase();
        const commandResult = handleSlashCommand(trimmed, model_name, messages, token_estimates, thinking, iterationCalls);

        if (commandResult === true) {
            continue; // command handled, no model call
        }
        if (commandResult === "save") {
            const ts = await saveChatHistory(messages, model_name, SessionContext.chatTitle);
            await saveAuditHistory(ts, SessionContext.chatTitle, model_name, getAuditData(model_name));
            continue;
        }
        // false = not a command, proceed to model

        // Prepend current mode context so the model always knows its operating mode
        const modeLabel = SessionContext.agentMode === "plan" ? "Plan" : "Agent";
        const prefixedInput = `You are in ${modeLabel} Mode. ${user_input}`;
        messages.push({ role: "user", content: prefixedInput });
        SessionContext.messageCount++;

        // Generate chat title from the first real user message (fire-and-forget; non-blocking).
        // The promise settles in the background; if the first save happens before it resolves,
        // saveChatHistory falls back to title-less naming.
        if (!SessionContext.chatTitle) {
            generateChatTitle(user_input, model_name).then((title) => {
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

            const pre_call_tokens = estimateTokens(
                messages,
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
                    content: content || null
                };
                if (content) assistant_message.content = content;


                // Only push reasoning_content back into messages when thinking is
                // explicitly enabled. If disabled, storing it triggers a 400 error
                // from the DeepSeek API on subsequent calls.
                if (HYPERPARAMETERS.extra_body?.thinking?.type === "enabled") {
                    assistant_message.reasoning_content = reasoning_content || "";
                }

                if (tool_calls) assistant_message.tool_calls = tool_calls;
                messages.push(assistant_message);

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
            await saveAuditHistory(ts, SessionContext.chatTitle, model_name, getAuditData(model_name));
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
                    await saveAuditHistory(ts, SessionContext.chatTitle, model_name, getAuditData(model_name));
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
    const { model_name, apiKey, baseURL, provider } = await startChat();

    // Create the OpenAI client dynamically based on the selected provider
    client = new OpenAI({ apiKey, baseURL });
    activeModelConfig = { model_name, apiKey, baseURL, provider };

    const extra_body = await thinkingToggle(provider);
    HYPERPARAMETERS.extra_body = extra_body;

    printSessionBanner(model_name, extra_body);

    await promptAutoSave();

    await archiveActiveToHistory("session-startup");

    await multiTurnLoop(model_name);
    process.exit(0);
}


