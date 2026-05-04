import OpenAI from "openai";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { ask, startChat, thinkingToggle } from "./cliInput.js";
import { estimateTokens } from "./tokenizer.js";
import { printStreamResponse } from "./streamHandler.js";
import { MANAGER_TOOLS, callToolsInBatch } from "../tools/registry.js";
import { saveChatHistory } from "./chatHistory.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.chdir(path.join(__dirname, ".."));``

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
    reasoning_effort: "high",
    system_prompt:
        `
            ## Role
            Expert Senior Software Engineer.

            ## Technical Environment
            - OS: Windows 
            - Terminal: PowerShell (Ensure all scripts are .ps1 compatible)

            ## Source of Truth
            - Primary: Codebase Markdown files in \`/docs\`.
            - Secondary: Industry-standard maintainability patterns.

            ## Output Constraints
            - Provide code blocks first.
            - Keep explanations concise and technical.
            - Use 'DRY' and 'SOLID' principles as the default architecture.

            ## Tools Usage
            - You must leverage batch tool-calling when using tools. Only call
            sequentially if the next tool's input depends on the previous one's output.

            ## Ambiguity Resolution
            - If user input is ambiguous, ask for clarification before responding.
            Should not proceed anything until the ambiguity is resolved.
            - User preferences must not be assumed. Always ask if not explicitly stated.
            
            ## Agent Role
            - You are a manager agent overseeing the software development process.
            Your role is to delegate tasks to sub-agents, review their outputs, and ensure the overall project progresses smoothly.
            You are responsible for high-level planning, coordination, quality control, and delivered
            final results.

            ## Skills
            - Read skills at docs/skills/managing_agents.md and docs/skills/using_tools.md.

            ## Workflow and Planning
            1. **Plan First:** Before writing implementation code, provide a
            concise summary of file changes (Create/Modify/Delete).
            2. **Artifact Generation:** Create a \`temp-plan.md\`file for planning and
            user review. This file should act as the checklist for the current task.
            When start implementation, update the \`temp-plan.md\` with completed items and next steps.
            Do not delete the planning content.
            3. **User Confirmation:** Ask the user to review the \`temp-plan.md\` and
            confirm before proceeding to code implementation.

            ## Markdowns Generation
            - All markdowns must be generated in artifacts folder (already exist).
        `
};

// ---------------------------------------------------------------------------
// Model invocation
// ---------------------------------------------------------------------------
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

    if (extra_body?.thinking) {
        kwargs.thinking = extra_body.thinking;
    }
    if (extra_body?.thinking?.type !== "disabled") {
        kwargs.reasoning_effort = reasoning_effort;
    }

    return client.chat.completions.create(kwargs);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Multi-turn conversation loop
// ---------------------------------------------------------------------------
async function multiTurnLoop(model_name) {
    let stop = false;
    let reasoning_history = "";
    const messages = [
        { role: "system", content: HYPERPARAMETERS.system_prompt },
    ];
    const available_tools = Object.values(MANAGER_TOOLS).map(
        ([schema]) => schema
    );

    while (!stop) {
        // ---- Per-iteration telemetry collector ----
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
                `\x1b[93m[Context Window] Deleted ${deleted_count} oldest message(s) to stay within token limit.\x1b[0m`
            );
        }

        console.log(
            `System:\n-Input Tokens: ${token_estimates.input_tokens}.\n` +
                `-Output Tokens: ${token_estimates.output_tokens}\n` +
                `-Total Tokens: ${token_estimates.total_tokens}.`
        );

        const user_input = await ask(
            "Enter your message (type 'exit' to quit):\n"
        );
        if (user_input.toLowerCase() === "exit") {
            stop = true;
            continue;
        }

        messages.push({ role: "user", content: user_input });

        // Inner loop to handle potential back-and-forth tool executions
        while (true) {
            // ---- Telemetry: recalculate tokens before call ----
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
                    "\n\x1b[91m[Error] Context window exceeded. " +
                        "Please restart the conversation to continue.\x1b[0m"
                );
                break;
            }

            const stream = await callModel(
                model_name,
                available_tokens,
                messages,
                HYPERPARAMETERS.stream,
                HYPERPARAMETERS.extra_body,
                HYPERPARAMETERS.reasoning_effort,
                available_tools
            );

            const { reasoning_content, content, tool_calls } =
                await printStreamResponse(stream, HYPERPARAMETERS.extra_body);

            // ---- Telemetry: now that we have tool_calls, push the record ----
            // If the assistant responded with content only (no tool calls), this was an
            // assistant turn — not a tool_result turn — even if the last message in the
            // history is a tool result from the previous iteration.
            const effective_call_type =
                !tool_calls && call_type === "tool_result" ? "assistant" : call_type;
            const toolsUsed = tool_calls
                ? tool_calls.map((tc) => tc.function?.name || "unknown")
                : [];
            iterationCalls.push({
                type: effective_call_type,
                inputTokens: pre_call_tokens.input_tokens,
                toolCalled: !!tool_calls,
                toolsUsed,
                batchCall: tool_calls && tool_calls.length > 1,
            });

            // Optimization: Standardised Message History
            const assistant_message = { 
                role: "assistant",
                content: content || "",
            };

            // Only push reasoning_content back into messages when thinking is
            // explicitly enabled. If disabled, storing it triggers a 400 error
            // from the DeepSeek API on subsequent calls.
            if (HYPERPARAMETERS.extra_body?.thinking?.type === "enabled") {
                assistant_message.reasoning_content = reasoning_content || "";
            }

            if (tool_calls) assistant_message.tool_calls = tool_calls;
            messages.push(assistant_message);

            // Execute Tools if requested — run all via callToolsInBatch.
            // Wrapped in try/catch so an unhandled exception does not crash the loop.
            if (tool_calls) {
                try {
                    await callToolsInBatch(tool_calls, MANAGER_TOOLS, messages);
                } catch (e) {
                    // Push a synthetic tool-error message so the model can recover
                    const errMsg = `Fatal error during batch tool execution: ${e.message || e}`;
                    console.log(`\x1b[91m${errMsg}\x1b[0m`);
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
                // Loop back to let the model respond to tool results (or errors)
                continue;
            } else {
                // No tool calls made; break inner loop to wait for next user input
                break;
            }
        }

        // ---- Ask user whether to save ----
        const saveChoice = await ask(
            "\x1b[33mDo you want to save current session?\n1. Yes.\n2. No:\x1b[0m\n"
        );
        if (saveChoice.trim() !== "2") {
            await saveChatHistory(messages, model_name);
        } else {
            console.log("\x1b[90m[Chat History] Save skipped.\x1b[0m");
        }

        // ---- Prompt for new session ----
        const newSessionInput = await ask(
            "\x1b[33mStart a new session? (Type 'cls' to exit or press Enter to continue):\x1b[0m\n"
        );
        if (newSessionInput.trim().toLowerCase() === "cls") {
            stop = true;
            continue;
        }

        // ---- Print iteration telemetry summary ----
        const nativeCount = iterationCalls.length;
        let accumulatedTokens = 0;
        console.log("\x1b[36m[Iteration Summary]\x1b[0m");
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
}

// ---------------------------------------------------------------------------
// Public entry: run the full chat loop
// ---------------------------------------------------------------------------
export async function runChat() {
    const model_name = await startChat();
    const extra_body = await thinkingToggle();
    HYPERPARAMETERS.extra_body = extra_body;
    await multiTurnLoop(model_name);
}
