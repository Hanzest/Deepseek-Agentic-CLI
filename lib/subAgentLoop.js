import OpenAI from "openai";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { printStreamResponse } from "./streamHandler.js";
import { estimateTokens } from "./tokenizer.js";
import { SUBAGENT_TOOLS, callToolsInBatch } from "../tools/registry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "..", ".env") });

// Client is created dynamically in runSubAgent() based on the active model
// config passed from the orchestrator. This enables multi-provider support
// (DeepSeek / Gemini) for sub-agents.

const MAX_OUTPUT_TOKENS = 8192;

const HYPERPARAMETERS = {
    token_limit: 65535,
    token_multiplier: 1.5,
    stream: true,
    // extra_body is computed dynamically in runSubAgent() based on the
    // active provider (DeepSeek vs Gemini). Sub-agents always have thinking
    // disabled/minimal since they are autonomous workers.
};

const DEFAULT_MAX_ITERATIONS = 20;

/**
 * Extract budget_iterations from the sub-agent markdown prompt banner.
 * Looks for: "> **Iteration Budget:** N maximum."
 * @param {string} markdown
 * @returns {number|null} Parsed integer or null if not found.
 */
function parseBudgetIterations(markdown) {
    const m = markdown.match(/\*\*Iteration Budget:\*\*\s*(\d+)/);
    return m ? parseInt(m[1], 10) : null;
}

function buildSystemPrompt(subAgentMarkdown, maxIterations) {
    return [
        "You are an autonomous sub-agent working on a delegated task.",
        "You have access to tools. Use them to complete the deliverable.",
        "",
        "## Delegated Task",
        subAgentMarkdown,
        "",
        "## Workflow",
        "1. Read the task carefully.",
        "2. Use tools to gather information, make changes, and verify results.",
        "3. When you have completed the deliverable, respond with a clear summary",
        "   of what was done, including file paths and key decisions.",
        "4. Do NOT call any tools if you are done — just respond with the final summary.",
        "",
        "## Batch Tool-Calling Strategy",
        "- You MUST leverage batch tool-calling when using tools. Only call",
        "  sequentially if the next tool's input depends on the previous one's output.",
        "- **Dependency Rule:** Independent tools (e.g., get_project_tree +",
        "  multi_file_search_string + read_file_chunk) → dispatch together in ONE turn.",
        "  Tool B needs Tool A's output → two sequential turns.",
        "- **Native batch:** fetch_url accepts urls[] — always batch multiple URLs.",
        "- **Phase patterns:** Exploration = tree + search + read (batch).",
        "  Implementation = writes to different files (batch).",
        "  Verification = read multiple files in one turn.",
        "- **Anti-patterns:** Do NOT call read-only tools one-at-a-time.",
        "  Do NOT fetch URLs one-by-one. Do NOT wait for a read before starting",
        "  an independent search.",
        "",
        "## Constraints",
        "- You have a maximum of " + maxIterations + " iterations to complete the task.",
        "- All tool results will be provided back to you automatically.",
        "- When you are finished, respond without any tool calls.",
    ].join("\n");
}

// ---------------------------------------------------------------------------
// Run the sub-agent autonomous loop
//
// @param {string} subAgentMarkdown - The structured task prompt
// @param {string} subAgentName     - Display name for logging
// @param {object} [logger]         - Optional logger. Must have a log(msg) method.
//                                    Defaults to console.
// ---------------------------------------------------------------------------
export async function runSubAgent(subAgentMarkdown, subAgentName, logger = console, agentMode = "agent", modelConfig = {}) {
    const { apiKey, baseURL, provider = "deepseek", model_name = "deepseek-chat" } = modelConfig;

    // Create client dynamically for the active provider
    const client = new OpenAI({ apiKey, baseURL });

    // Sub-agents always have thinking disabled (DeepSeek) or minimal (Gemini).
    // They are autonomous workers and don't benefit from chain-of-thought visibility.
    const extra_body = provider === "gemini"
        ? { reasoning_effort: "minimal" }
        : { thinking: { type: "disabled" } };

    const budget = parseBudgetIterations(subAgentMarkdown);
    const MAX_ITERATIONS = budget ?? DEFAULT_MAX_ITERATIONS;
    const tag = `[Sub-Agent: ${subAgentName}]`;
    const messages = [
        { role: "system", content: buildSystemPrompt(subAgentMarkdown, MAX_ITERATIONS) },
    ];

    const available_tools = Object.values(SUBAGENT_TOOLS).map(
        ([schema]) => schema
    );

    const log = (msg) => logger.log(msg);

    log(`\n${"=".repeat(56)}`);
    log(`  ${tag} Starting autonomous execution...`);
    log(`${"=".repeat(56)}\n`);

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        const preTokens = estimateTokens(
            messages,
            "",                     // no reasoning history for sub-agents
            HYPERPARAMETERS.token_multiplier
        );

        log(`\n${"-".repeat(56)}`);
        log(`  ${tag} Iteration ${iteration + 1}/${MAX_ITERATIONS}`);
        log(`  Tokens: ${preTokens.input_tokens} in / ${preTokens.output_tokens} out / ${preTokens.total_tokens} total`);
        log(`${"-".repeat(56)}`);

        try {
            const stream = await client.chat.completions.create({
                model: model_name,
                messages: messages,
                max_tokens: Math.min(MAX_OUTPUT_TOKENS, HYPERPARAMETERS.token_limit),
                stream: HYPERPARAMETERS.stream,
                tools: available_tools.length > 0 ? available_tools : undefined,
                // Pass provider-appropriate thinking config.
                // Only DeepSeek's thinking.type is sent as a top-level param;
                // Gemini's reasoning_effort must NOT be passed top-level — its
                // OpenAI-compatible endpoint rejects unknown fields with 400.
                ...(extra_body?.thinking
                    ? { thinking: extra_body.thinking }
                    : {}),
            });

            const { reasoning_content, content, tool_calls } =
                await printStreamResponse(stream, extra_body);
            const assistantMessage = {
                role: "assistant",
            };
            if (content) assistantMessage.content = content;


            // IMPORTANT: Do NOT push reasoning_content back into messages.
            // The DeepSeek API rejects assistant messages with reasoning_content
            // on subsequent calls unless it was the one that generated it.
            // Sub-agents are autonomous workers — they don't need to see their
            // own chain-of-thought from previous iterations.

            if (tool_calls && tool_calls.length > 0) {
                assistantMessage.tool_calls = tool_calls;
            }

            messages.push(assistantMessage);

            if (!tool_calls || tool_calls.length === 0) {
                log(`\n${"=".repeat(56)}`);
                log(`  ${tag} Task complete.`);
                log(`${"=".repeat(56)}\n`);
                return {
                    finalContent: content || "(no content)",
                    reasoningContent: reasoning_content || "",
                    iterationCount: iteration + 1,
                    messages,
                };
            }

            try {
                await callToolsInBatch(tool_calls, SUBAGENT_TOOLS, messages, agentMode);
            } catch (e) {
                const errMsg = `Error during sub-agent tool execution: ${e.message || e}`;
                log(`\x1b[91m${errMsg}\x1b[0m`);
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
        } catch (e) {
            const errMsg = `Error in sub-agent API call: ${e.message || e}`;
            log(`\x1b[91m${errMsg}\x1b[0m`);
            return {
                finalContent: `ERROR: ${errMsg}`,
                reasoningContent: "",
                iterationCount: iteration + 1,
                messages,
            };
        }
    }

    log(`\n\x1b[93m  ${tag} Max iterations (${MAX_ITERATIONS}) reached. Forcing termination.\x1b[0m`);
    return {
        finalContent: "Task terminated: reached maximum iteration limit.",
        reasoningContent: "",
        iterationCount: MAX_ITERATIONS,
        messages,
    };
}
