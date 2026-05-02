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

const client = new OpenAI({
    apiKey: process.env.MODEL_API_KEY,
    baseURL: process.env.MODEL_BASE_URL,
});

// ---------------------------------------------------------------------------
// Hyperparameters
// ---------------------------------------------------------------------------
const HYPERPARAMETERS = {
    token_limit: 65535,
    token_multiplier: 1.5,
    stream: true,
    // Reasoning fully disabled for sub-agents: they are autonomous workers.
    // The DeepSeek API rejects reasoning_content on subsequent calls, so we
    // omit reasoning_effort entirely when thinking is disabled.
    extra_body: {
        thinking: { type: "disabled" },
    },
};

const MAX_ITERATIONS = 20;

// ---------------------------------------------------------------------------
// Build the sub-agent system prompt
// ---------------------------------------------------------------------------
function buildSystemPrompt(subAgentMarkdown) {
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
        "## Constraints",
        "- You may call multiple tools in a single turn (batch tool-calling).",
        "- You have a maximum of " + MAX_ITERATIONS + " iterations to complete the task.",
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
export async function runSubAgent(subAgentMarkdown, subAgentName, logger = console) {
    const tag = `[Sub-Agent: ${subAgentName}]`;
    const messages = [
        { role: "system", content: buildSystemPrompt(subAgentMarkdown) },
    ];

    const available_tools = Object.values(SUBAGENT_TOOLS).map(
        ([schema]) => schema
    );

    const log = (msg) => logger.log(msg);

    log(`\n${"=".repeat(56)}`);
    log(`  ${tag} Starting autonomous execution...`);
    log(`${"=".repeat(56)}\n`);

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        // ---- Token telemetry (shared estimator, zero I/O) ----
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
                model: process.env.MODEL_NAME || "deepseek-chat",
                messages: messages,
                max_tokens: HYPERPARAMETERS.token_limit,
                stream: HYPERPARAMETERS.stream,
                tools: available_tools.length > 0 ? available_tools : undefined,
                // Pass thinking config so "disabled" actually takes effect.
                // Without this, the API uses its default (enabled) and may
                // generate reasoning_content despite our intent to disable it.
                ...(HYPERPARAMETERS.extra_body?.thinking
                    ? { thinking: HYPERPARAMETERS.extra_body.thinking }
                    : {}),
            });

            const { reasoning_content, content, tool_calls } =
                await printStreamResponse(stream, HYPERPARAMETERS.extra_body);

            // Build assistant message
            const assistantMessage = {
                role: "assistant",
                content: content || "",
            };

            // IMPORTANT: Do NOT push reasoning_content back into messages.
            // The DeepSeek API rejects assistant messages with reasoning_content
            // on subsequent calls unless it was the one that generated it.
            // Sub-agents are autonomous workers — they don't need to see their
            // own chain-of-thought from previous iterations.

            if (tool_calls && tool_calls.length > 0) {
                assistantMessage.tool_calls = tool_calls;
            }

            messages.push(assistantMessage);

            // If no tool calls, the sub-agent is done
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

            // Execute tool calls in batch
            try {
                await callToolsInBatch(tool_calls, SUBAGENT_TOOLS, messages);
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

    // Max iterations reached
    log(`\n\x1b[93m  ${tag} Max iterations (${MAX_ITERATIONS}) reached. Forcing termination.\x1b[0m`);
    return {
        finalContent: "Task terminated: reached maximum iteration limit.",
        reasoningContent: "",
        iterationCount: MAX_ITERATIONS,
        messages,
    };
}
