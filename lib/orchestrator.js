import OpenAI from "openai";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { ask, askYesNo, startChat, thinkingToggle, createPromptLoop } from "./cliInput.js";
import { estimateTokens } from "./tokenizer.js";
import { printStreamResponse } from "./streamHandler.js";
import { MANAGER_TOOLS, callToolsInBatch } from "../tools/registry.js";
import { saveChatHistory, sanitizeFilename } from "./chatHistory.js";
import { C, colorize } from "./colors.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.chdir(path.join(__dirname, ".."));

dotenv.config({ path: path.join(__dirname, "..", ".env") });

// Client and config are set dynamically after model selection in runChat().
// Formerly created at module load; now lazy-initialized to support multiple
// providers (DeepSeek / Gemini) chosen at runtime.
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
};

// Mutable tools blocked in Plan Mode — unless the target path is inside
// the artifacts/ folder (safe workspace for temp-plan.md generation).
const MUTATION_BLOCKED_TOOLS = new Set([
    "patch_file",
    "write_or_create_file",
    "execute_terminal_command",
]);

export { SessionContext, MUTATION_BLOCKED_TOOLS };

// Pricing per 1M tokens (USD)
const PRICING = {
    "deepseek-v4-flash":       { input: 0.0028, output: 0.28, cache_miss: 0.14 },
    "deepseek-v4-pro":         { input: 0.003625, output: 0.87, cache_miss: 0.435 },
    "gemini-3-flash-preview":  { input: 0.05, output: 3.0, cache_miss: 0.5 },
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
            Expert Senior Software Engineer.

            ## Technical Environment
            - OS: Windows 
            - Terminal: PowerShell (Ensure all scripts are .ps1 compatible)

            ## Source of Truth
            - Primary: Codebase indexing Markdown in \`/docs/README.md\` for information retrieval.
            - Secondary: Industry-standard maintainability patterns.
            - Repository: \`docs/this_repo\`.

            ## Output Constraints
            - Provide code blocks first.
            - Keep explanations concise and technical.
            - Use 'DRY' and 'SOLID' principles as the default architecture.

            ## Tools Usage
            - After initial codebase inspection, read \`docs/tool-categories.md\` to discover
            what capability categories of tools are available and pick the right tool for each task.
            - **Batch-first mandate:** You must leverage batch tool-calling when using tools to execute
            all-at-once if applicable. Only call sequentially if the next tool's input depends
            on the previous one's output.
            - **Batch strategies by category:**
              - Codebase Inspection: \`get_project_tree\` + \`multi_file_search_string\` + \`read_file_chunk\` can all dispatch in one turn.
              - Web Research: Dispatch all \`search_web\` calls together; then feed result URLs into \`fetch_url({ urls: [...] })\` in the next turn.
              - File Mutation: writes to different files batch together; writes to the same file must be sequential.
            - **Similar-tool disambiguation:**
              - \`get_project_tree\` vs \`execute_terminal_command\` for exploration → always prefer \`get_project_tree\` (read-only, no consent).
              - \`patch_file\` vs \`write_or_create_file\` → prefer \`patch_file\` for edits ≤~20 lines; use \`write_or_create_file\` for new files or large rewrites.
              - \`read_file_chunk\` vs \`multi_file_search_string\` → use \`read_file_chunk\` when you know the file path; use \`multi_file_search_string\` to find where something lives.
              - \`search_web\` vs \`fetch_url\` → use \`search_web\` when you don't know the URL; use \`fetch_url\` when you do.

            ## Ambiguity Resolution
            - If user input is ambiguous, ask for clarification before responding.
            Should not proceed anything until the ambiguity is resolved.
            - User preferences must not be assumed. Always ask if not explicitly stated.
            
            ## Agent Role
            - You are a manager agent overseeing the software development process.
            Your role is to delegate tasks to sub-agents, review their outputs, and ensure the overall project progresses smoothly.
            You are responsible for high-level planning, coordination, quality control, and delivered
            final results.
            - Codebase inspection likely more than 5 files are required to delegate sub-agents.

            ## Mode System
            - You operate in one of two modes: **Plan Mode** or **Agent Mode**.
            - **Plan Mode:** Read-only tools + delegation are allowed.
              File mutation (\`patch_file\`, \`write_or_create_file\`) and system
              execution (\`execute_terminal_command\`) are BLOCKED, except for
              writes inside the \`artifacts/\` folder (safe workspace for plans).
              Asking user preferences and confirmations is allowed and encouraged.
            - **Agent Mode:** All tools are available. Switch only after the user
              approves the plan.

            ## Skills
            - Read skills at docs/skills/managing_agents.md and docs/skills/using_tools.md.

            ## Workflow and Planning
            **Plan First:** In Plan Mode, create a artifacts/temp-plan.md for the plan.
            The plan must include these sections:
            - Overall Approach: A high-level description of how you will tackle the task.
            - Important Notes: Any assumptions, clarifying questions for the user, or preferences
            you takes notes from asking the user preferences or clarifications before creating this plan.
            - Changes Summary: A bullet-point list or table of files to be created,
            modified, or deleted, with a brief description of the change for each. Reference structural
            landmarks (e.g., function names) rather than fragile line numbers.
            - Task Delegation: A list of any sub-tasks that can be delegated to specialized
            agents or tools, along with the rationale. (Max 5 lines summary per sub-task)
            - Implementation Checklist: A step-by-step "to-do list" for Agent Mode.
            You must group actions by execution turn to enforce the **batch-first mandate**.
            Explicitly state which tool(s) will be called in each turn to minimize
            sequential bottlenecks.
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
    console.log(`  ${colorize("/plan", C.tool)}     — Switch to Plan Mode (mutation blocked, artifacts/ exempt)`);
    console.log(`  ${colorize("/agent", C.tool)}    — Switch to Agent Mode (all tools available)`);
    console.log(`  ${colorize("/exit", C.tool)}     — Quit the chat session`);
    console.log(`  ${colorize("/save", C.tool)}     — Save current session now`);
    console.log(`  ${colorize("/clear", C.tool)}    — Clear the terminal`);
    console.log(`  ${colorize("/status", C.tool)}   — Show session info (mode, model, tokens, messages)`);
    console.log(`  ${colorize("/verbose", C.tool)}  — Toggle detailed telemetry on/off`);
    console.log(`  ${colorize("/help", C.tool)}     — Show this help`);
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

function printModeSwitch(newMode) {
    const W = 60;
    const sep = colorize("─".repeat(W), C.border);
    const label = newMode === "plan"
        ? "Plan Mode — file mutation and system execution are now restricted (artifacts/ exempt)"
        : "Agent Mode — all tools available.";
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
    if (!hit) return; // below 15% — silent

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
            toolInfo = "—";
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
        console.log(colorize("[Chat History] Auto-save enabled — session will be saved after every turn.", C.success));
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
// Chat Title Generation — fires once per session from the first user message.
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
                        "first message intent. Return ONLY the title, nothing else — no prefix, no explanation.",
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
// Iteration Guard — prompts the user when the inner tool-execution loop
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
        `  [Guard] Continuing — budget extended to ${newLimit} iterations.`,
        C.system
    ));
    return { action: "continue" };
}

async function multiTurnLoop(model_name) {
    let stop = false;
    let reasoning_history = "";
    const messages = [
        { role: "system", content: HYPERPARAMETERS.system_prompt },
    ];
    const available_tools = Object.values(MANAGER_TOOLS).map(
        ([schema]) => schema
    );
    const thinking = HYPERPARAMETERS.extra_body;

    const { ask: askWithHistory, addToHistory, close: closePrompt, pause: pausePrompt } = createPromptLoop();

    while (!stop) {
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
                if (saveChoice.trim().toLowerCase() === "y") {
                    await saveChatHistory(messages, model_name, SessionContext.chatTitle);
                } else {
                    console.log(colorize("[Chat History] Save skipped.", C.dim));
                }
            } else {
                await pausePrompt();
                const saveChoice = await ask(
                    colorize("Do you want to save current session?\n1. Yes.\n2. No:\n", C.warning)
                );
                if (saveChoice.trim() !== "2") {
                    await saveChatHistory(messages, model_name, SessionContext.chatTitle);
                } else {
                    console.log(colorize("[Chat History] Save skipped.", C.dim));
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
            await saveChatHistory(messages, model_name, SessionContext.chatTitle);
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
                await printStreamResponse(stream, HYPERPARAMETERS.extra_body);

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

            // Optimization: Standardised Message History
            const assistant_message = { 
                role: "assistant",
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
                    await callToolsInBatch(tool_calls, MANAGER_TOOLS, messages, SessionContext.agentMode);
                } catch (e) {
                    const errMsg = `Fatal error during batch tool execution: ${e.message || e}`;
                    console.log(colorize(errMsg, C.error));
                    for (const tc of tool_calls) {
                        messages.push({
                            role: "tool",
                            tool_call_id: tc.id,
                            name: tc.function?.name || "unknown",
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
        }

        if (SessionContext.autoSave === true) {
            await saveChatHistory(messages, model_name, SessionContext.chatTitle);
        } else if (SessionContext.autoSave === false) {
        } else {
            await pausePrompt();
            const saveChoice = await ask(
                colorize("Do you want to save current session?\n1. Yes.\n2. No:\n", C.warning)
            );
            if (saveChoice.trim() !== "2") {
                await saveChatHistory(messages, model_name, SessionContext.chatTitle);
            } else {
                console.log(colorize("[Chat History] Save skipped.", C.dim));
            }
        }

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

    await multiTurnLoop(model_name);
    process.exit(0);
}


